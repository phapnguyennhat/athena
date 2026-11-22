import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

export type StreakView = {
  current: number;
  longest: number;
  learnedToday: boolean;
  /** Local 'YYYY-MM-DD' of today in the user's timezone. */
  today: string;
  /** Mon..Sun of the current local week: true = a learning day. */
  week: boolean[];
};

/**
 * Streak rules (PROJECT_SPEC §5.7): one daily_activity row per user and local day; the streak grows by at most one
 * per day and restarts at 1 after a missed day. The local day is computed in SQL from the user's IANA timezone at
 * the time of the action and is never rewritten, so a timezone change does not touch history.
 */
@Injectable()
export class StreakService {
  constructor(private readonly ds: DataSource) {}

  /**
   * Records a qualifying action. Must run inside the caller's transaction (lesson completion, quiz submission),
   * so a rolled-back action leaves no activity behind. Concurrent calls serialize on the user row lock.
   */
  async record(
    m: EntityManager,
    userId: string,
    at = new Date(),
  ): Promise<{ date: string; newDay: boolean }> {
    const [user] = await m.query(
      `SELECT to_char(($2::timestamptz AT TIME ZONE timezone)::date, 'YYYY-MM-DD') AS today FROM users WHERE id = $1 FOR UPDATE`,
      [userId, at],
    );
    const today: string = user.today;
    const [row] = await m.query(
      `INSERT INTO daily_activity (user_id, activity_date) VALUES ($1, $2)
       ON CONFLICT (user_id, activity_date) DO UPDATE SET count = daily_activity.count + 1, updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [userId, today],
    );
    if (!row.inserted) return { date: today, newDay: false };
    // A day earlier than the last one can only follow a timezone change westwards: it neither extends nor breaks.
    const next = `CASE WHEN last_activity_date = $2::date - 1 THEN current_streak + 1
                       WHEN last_activity_date >= $2::date THEN current_streak
                       ELSE 1 END`;
    await m.query(
      `UPDATE users SET current_streak = ${next}, longest_streak = GREATEST(longest_streak, ${next}),
         last_activity_date = GREATEST(last_activity_date, $2::date) WHERE id = $1`,
      [userId, today],
    );
    return { date: today, newDay: true };
  }

  /** The stored streak only breaks on the next action, so a gap since the last day reads as 0 here. */
  async view(userId: string, at = new Date()): Promise<StreakView> {
    const [u] = await this.ds.query(
      `SELECT current_streak, longest_streak, to_char(last_activity_date, 'YYYY-MM-DD') AS last,
              to_char(t.today, 'YYYY-MM-DD') AS today, to_char(date_trunc('week', t.today)::date, 'YYYY-MM-DD') AS monday
       FROM users, LATERAL (SELECT ($2::timestamptz AT TIME ZONE timezone)::date AS today) t WHERE id = $1`,
      [userId, at],
    );
    const days: { d: string }[] = await this.ds.query(
      `SELECT to_char(activity_date, 'YYYY-MM-DD') AS d FROM daily_activity
       WHERE user_id = $1 AND activity_date >= $2::date AND activity_date < $2::date + 7`,
      [userId, u.monday],
    );
    const learned = new Set(days.map((r) => r.d));
    const week = Array.from({ length: 7 }, (_, i) =>
      learned.has(addDays(u.monday, i)),
    );
    const alive = u.last !== null && u.last >= addDays(u.today, -1);
    return {
      current: alive ? u.current_streak : 0,
      longest: u.longest_streak,
      learnedToday: u.last !== null && u.last >= u.today,
      today: u.today,
      week,
    };
  }
}

/** 'YYYY-MM-DD' plus n days, calendar arithmetic in UTC (no timezone involved). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

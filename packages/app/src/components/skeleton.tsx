import { createContext, use, useEffect, type ReactNode } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { AnimatedView, Text, View } from '@/tw';

// One pulse shared by every block of a screen, so they breathe in sync.
const Pulse = createContext<SharedValue<number> | null>(null);

/** Wraps a skeleton layout: hidden from screen readers, announced once as loading. */
export function SkeletonGroup({ children, label = 'Đang tải' }: { children: ReactNode; label?: string }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!reduced) opacity.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true);
  }, [reduced, opacity]);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
      <Pulse value={opacity}>{children}</Pulse>
    </View>
  );
}

/** A grey placeholder block; size and shape come from `className` (e.g. "h-4 w-2/3 rounded-full"). */
export function Bone({ className = '' }: { className?: string }) {
  const opacity = use(Pulse);
  const style = useAnimatedStyle(() => ({ opacity: opacity?.value ?? 1 }));
  // className on the animated view itself, so percentage widths resolve against the parent.
  return <AnimatedView style={style} className={`rounded-lg bg-line ${className}`} />;
}

/** Lines of text: full width, the last one shorter. */
function Lines({ n, h = 'h-4' }: { n: number; h?: string }) {
  return (
    <View className="gap-2.5">
      {Array.from({ length: n }, (_, i) => (
        <Bone key={i} className={`${h} ${i === n - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </View>
  );
}

const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <View className={`gap-3 rounded-3xl border border-line bg-surface p-5 ${className}`}>{children}</View>
);

export function HomeSkeleton() {
  return (
    <SkeletonGroup>
      <View className="gap-7">
        <Card>
          <View className="flex-row items-center gap-3">
            <Bone className="h-10 w-10 rounded-full" />
            <View className="flex-1 gap-2">
              <Bone className="h-7 w-3/5" />
              <Bone className="h-4 w-4/5" />
            </View>
          </View>
          <View className="mt-2 flex-row justify-between">
            {Array.from({ length: 7 }, (_, i) => (
              <Bone key={i} className="h-6 w-6 rounded-full" />
            ))}
          </View>
        </Card>
        <View className="gap-3">
          <Bone className="h-6 w-32" />
          <Bone className="h-52 w-full rounded-3xl" />
        </View>
      </View>
    </SkeletonGroup>
  );
}

export function PathListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <SkeletonGroup>
      <View className="gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} className="gap-3 rounded-2xl border border-line bg-surface p-4">
            <View className="flex-row justify-between gap-6">
              <Bone className="h-5 flex-1" />
              <Bone className="h-4 w-12" />
            </View>
            <Bone className="h-2 w-full rounded-full" />
            <Bone className="h-3.5 w-3/5" />
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}

/** Path detail. With `caption`, it stands for path generation in progress (the caption says so). */
export function PathSkeleton({ caption }: { caption?: string }) {
  return (
    <SkeletonGroup label={caption}>
      <View className="gap-4 px-5 pt-2">
        {caption ? (
          <Text accessibilityLiveRegion="polite" className="text-[15px] font-semibold text-ink-muted">
            {caption}
          </Text>
        ) : null}
        <Bone className="h-9 w-4/5" />
        <Bone className="h-9 w-1/2" />
        <Lines n={3} />
        <Bone className="h-2 w-full rounded-full" />
        {[3, 2].map((n, i) => (
          <Card key={i} className="px-4">
            <Bone className="h-3.5 w-20" />
            <Bone className="h-5 w-3/4" />
            {Array.from({ length: n }, (_, j) => (
              <View key={j} className="flex-row items-center gap-3 py-1">
                <Bone className="h-4 w-4 rounded-full" />
                <Bone className="h-4 flex-1" />
              </View>
            ))}
          </Card>
        ))}
      </View>
    </SkeletonGroup>
  );
}

/** Lesson body. With `caption`, it stands for AI generation in progress (the caption says so). */
export function LessonBodySkeleton({ caption }: { caption?: string }) {
  return (
    <SkeletonGroup label={caption}>
      <View className="gap-6">
        {caption ? (
          <Text accessibilityLiveRegion="polite" className="text-[15px] font-semibold text-ink-muted">
            {caption}
          </Text>
        ) : null}
        <Lines n={4} h="h-[18px]" />
        {[0, 1].map((i) => (
          <View key={i} className="gap-3">
            <Bone className="h-6 w-3/5" />
            <Lines n={3} />
            <Bone className="h-24 w-full rounded-2xl" />
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}

export function LessonSkeleton() {
  return (
    <View className="gap-5 px-5 pt-2">
      <SkeletonGroup>
        <View className="gap-2">
          <Bone className="h-3.5 w-2/5" />
          <Bone className="h-8 w-full" />
          <Bone className="h-8 w-1/2" />
        </View>
      </SkeletonGroup>
      <LessonBodySkeleton />
    </View>
  );
}

export function QuizSkeleton({ caption }: { caption?: string }) {
  return (
    <SkeletonGroup label={caption}>
      <View className="gap-5 px-5 pt-2">
        {caption ? (
          <Text accessibilityLiveRegion="polite" className="text-[15px] font-semibold text-ink-muted">
            {caption}
          </Text>
        ) : null}
        {[0, 1].map((q) => (
          <View key={q} className="gap-2">
            <Bone className="h-3.5 w-16" />
            <Bone className="h-5 w-full" />
            <Bone className="mb-1 h-5 w-3/4" />
            {[0, 1, 2, 3].map((o) => (
              <Bone key={o} className="h-14 w-full rounded-2xl" />
            ))}
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}

/** Chat history placeholder: alternating assistant lines and user bubbles. */
export function ChatSkeleton() {
  return (
    <SkeletonGroup>
      <View className="gap-5 px-5 pt-4">
        <View className="flex-row gap-3 pr-6">
          <Bone className="h-7 w-7 rounded-full" />
          <View className="flex-1">
            <Lines n={2} />
          </View>
        </View>
        <Bone className="h-11 w-2/5 self-end rounded-3xl" />
        <View className="flex-row gap-3 pr-6">
          <Bone className="h-7 w-7 rounded-full" />
          <View className="flex-1">
            <Lines n={2} />
          </View>
        </View>
      </View>
    </SkeletonGroup>
  );
}

import { View } from '@/tw';

export type MarkState = 'done' | 'progress' | 'todo';

/** Lesson state as a fixed-cell mark: filled = done, half = in progress, hollow = not started. Never colour alone. */
export function StateMark({ state }: { state: MarkState }) {
  return (
    <View
      className={`h-4 w-4 overflow-hidden rounded-full border-2 ${state === 'todo' ? 'border-mark-off' : 'border-tint'}`}>
      {state === 'done' ? <View className="flex-1 bg-tint" /> : null}
      {state === 'progress' ? <View className="h-full w-1/2 bg-tint" /> : null}
    </View>
  );
}

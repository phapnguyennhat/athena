import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';

import { CourseRail, CourseRow } from '@/components/community-cards';
import { SectionTitle } from '@/components/home-sections';
import { Retry } from '@/components/retry';
import { ScreenHeader } from '@/components/screen-header';
import { PathListSkeleton } from '@/components/skeleton';
import { useLoad } from '@/hooks/use-load';
import { getCategories, getRecommendations, listCommunityPaths } from '@/lib/community-api';
import { Pressable, SafeAreaView, ScrollView, Text, TextInput, View, useCSSVariable } from '@/tw';

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`min-h-9 justify-center rounded-full border px-4 active:opacity-70 ${active ? 'border-tint bg-tint' : 'border-line bg-surface'}`}>
      <Text className={`text-[14px] font-semibold ${active ? 'text-on-tint' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

export default function CommunityScreen() {
  const router = useRouter();
  const muted = useCSSVariable('--color-ink-muted');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>();
  const [tag, setTag] = useState(useLocalSearchParams<{ tag?: string }>().tag);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const results = useLoad(() => listCommunityPaths({ q, category, tag }));
  const { reload } = results;
  useEffect(() => {
    reload();
  }, [q, category, tag, reload]);
  // Quiet extras: without them the screen still works, so no toast or retry.
  const categories = useLoad(() => getCategories().catch(() => []));
  const suggestions = useLoad(() => getRecommendations().catch(() => []));

  const filtered = Boolean(q || category || tag);
  const open = (id: string) => router.push(`/community/${id}`);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScreenHeader title="Cộng đồng" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-5 pt-2 pb-16"
        refreshControl={<RefreshControl refreshing={results.refreshing} onRefresh={results.refresh} />}>
        <View className="mx-5">
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Tìm khoá học…"
            placeholderTextColor={typeof muted === 'string' ? muted : '#A6A6AE'}
            accessibilityLabel="Tìm khoá học"
            returnKeyType="search"
            autoCorrect={false}
            underlineColorAndroid="transparent"
            textAlignVertical="center"
            style={{ paddingVertical: 12, paddingHorizontal: 16 }}
            className="min-h-[52px] rounded-[14px] border border-line bg-surface px-4 py-3 text-base leading-5 text-ink"
          />
        </View>
        {categories.data?.length ? (
          <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-5">
            <Chip label="Tất cả" active={!category} onPress={() => setCategory(undefined)} />
            {categories.data.map((c) => (
              <Chip key={c.id} label={c.name} active={category === c.id} onPress={() => setCategory(c.id)} />
            ))}
          </ScrollView>
        ) : null}
        {tag ? (
          <View className="mx-5 flex-row">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Bỏ lọc thẻ ${tag}`}
              onPress={() => setTag(undefined)}
              className="min-h-9 flex-row items-center gap-2 rounded-full bg-tint px-4 active:opacity-70">
              <Text className="text-[14px] font-semibold text-on-tint">#{tag}</Text>
              <Text className="text-[14px] font-bold text-on-tint">✕</Text>
            </Pressable>
          </View>
        ) : null}
        {!filtered && suggestions.data?.length ? (
          <View className="gap-3">
            <View className="mx-5">
              <SectionTitle>Gợi ý cho bạn</SectionTitle>
            </View>
            <CourseRail courses={suggestions.data} onOpen={open} />
          </View>
        ) : null}
        <View className="mx-5 gap-3">
          <SectionTitle>Khoá học</SectionTitle>
          {results.error ? (
            <Retry onPress={reload} />
          ) : !results.data ? (
            <PathListSkeleton />
          ) : !results.data.length ? (
            <Text className="text-[15px] leading-[22px] text-ink-muted">Chưa có khoá học phù hợp.</Text>
          ) : (
            results.data.map((c) => <CourseRow key={c.id} course={c} onPress={() => open(c.id)} onTag={setTag} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

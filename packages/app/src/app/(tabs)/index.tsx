import { BrandMark } from '@/components/brand-mark';
import {
  CommunityRail,
  ContinueSection,
  StreakCard,
  type CommunityCourse,
} from '@/components/home-sections';
import { ACTIVE } from '@/lib/sample-courses';
import { ThemeToggle } from '@/components/theme-toggle';
import { SafeAreaView, ScrollView, Text, View } from '@/tw';

// shortcut: static sample data, replace with API (progress, streak, community feed) once those endpoints exist.
const STREAK = { days: 5, week: [true, true, true, true, true, false, false], today: 4 };

const COMMUNITY: CommunityCourse[] = [
  { id: 'c1', title: 'Ngữ pháp tiếng Anh: thì hiện tại', author: 'minh.anh', level: 'Cơ bản', lessons: 8, cover: 'EN' },
  { id: 'c2', title: 'Học máy qua ví dụ', author: 'tuan.ml', level: 'Trung cấp', lessons: 14, cover: 'ML' },
  { id: 'c3', title: 'Quản lý tài chính cá nhân', author: 'lan.pham', level: 'Cơ bản', lessons: 6, cover: 'TC' },
];

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView contentContainerClassName="gap-7 pb-32" showsVerticalScrollIndicator={false}>
        <View className="mr-2 ml-5 flex-row items-center justify-between">
          <BrandMark />
          <ThemeToggle />
        </View>
        <View className="mr-5 ml-5 gap-7">
          <Text accessibilityRole="header" className="text-[30px] leading-9 font-black tracking-[-0.5px] text-ink">
            Chào bạn, học tiếp nào.
          </Text>
          <StreakCard {...STREAK} />
          <ContinueSection courses={ACTIVE} />
        </View>
        <CommunityRail courses={COMMUNITY} />
      </ScrollView>
    </SafeAreaView>
  );
}

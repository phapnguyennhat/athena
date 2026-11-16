import { useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { BrandMark } from '@/components/brand-mark';
import { DEMO_SLIDES } from '@/components/onboarding-demo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Link, Pressable, SafeAreaView, ScrollView, Text, View } from '@/tw';

export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  // One full-width page per slide; height yields on short phones so the actions stay on screen.
  const cardHeight = Math.min(380, Math.round(height * 0.45));
  const [index, setIndex] = useState(0);
  const slide = DEMO_SLIDES[index];

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="mr-2 ml-5 flex-row items-center justify-between">
        <BrandMark />
        <ThemeToggle />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled
        scrollEventThrottle={16}
        onScroll={(e) => {
          const next = Math.min(DEMO_SLIDES.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / width)));
          if (next !== index) setIndex(next);
        }}
        className="mt-5 grow-0">
        {DEMO_SLIDES.map(({ key, Card, title }) => (
          <View key={key} className="pr-5 pl-5" style={{ width, height: cardHeight }}>
            <View accessible accessibilityLabel={`Ví dụ: ${title}`} className="flex-1">
              <Card />
            </View>
          </View>
        ))}
      </ScrollView>

      <View className="mt-4 mr-5 ml-5 flex-row gap-1.5" importantForAccessibility="no-hide-descendants">
        {DEMO_SLIDES.map(({ key }, i) => (
          <View key={key} className={`h-2 rounded-full ${i === index ? 'w-6 bg-tint' : 'w-2 bg-mark-off'}`} />
        ))}
      </View>

      <View className="mt-5 mr-5 ml-5 flex-1">
        <Text
          accessibilityRole="header"
          textBreakStrategy="balanced"
          lineBreakStrategyIOS="standard"
          className="text-[30px] leading-9 font-black tracking-[-0.5px] text-ink">
          {slide.title}
        </Text>
        <Text className="mt-2 text-[15px] leading-[22px] text-ink-muted">{slide.body}</Text>
      </View>

      <View className="mr-5 mb-2 ml-5 gap-1">
        <Link href={{ pathname: '/account', params: { mode: 'sign-up' } }} asChild>
          <Pressable
            accessibilityRole="button"
            android_ripple={{ color: 'rgba(14, 14, 16, 0.18)' }}
            className="min-h-14 items-center justify-center overflow-hidden rounded-[28px] bg-tint ios:active:opacity-80">
            <Text className="text-base font-bold text-on-tint">Tạo tài khoản</Text>
          </Pressable>
        </Link>
        <Link href={{ pathname: '/account', params: { mode: 'sign-in' } }} asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đã có tài khoản? Đăng nhập"
            className="min-h-12 items-center justify-center active:opacity-70">
            <Text className="text-[15px] text-ink-muted">
              Đã có tài khoản? <Text className="font-semibold text-tint-ink">Đăng nhập</Text>
            </Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

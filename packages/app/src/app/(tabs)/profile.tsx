import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Appearance, RefreshControl, Switch } from 'react-native';

import { useAuth } from '@/auth';
import { Colors } from '@/constants/theme';
import { Retry } from '@/components/retry';
import { Bone, SkeletonGroup } from '@/components/skeleton';
import { toast } from '@/components/toast';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoad } from '@/hooks/use-load';
import { getDashboard, getMe, uploadAvatar, type Me } from '@/lib/learning-api';
import { Pressable, SafeAreaView, ScrollView, Text, View, useCSSVariable } from '@/tw';

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/** Tap to pick a photo: square crop, shrunk to a 512px JPEG, uploaded, then shown. */
function Avatar({ me, onChange }: { me: Me; onChange: (me: Me) => void }) {
  const [busy, setBusy] = useState(false);
  // Every reload signs a new URL for the same photo; keep the shown one until the photo itself changes,
  // so returning to the tab does not reload (and fade in) the image.
  const [uri, setUri] = useState(me.avatarUrl);
  const path = me.avatarUrl?.split('?')[0];
  if (uri?.split('?')[0] !== path) setUri(me.avatarUrl);
  const ink = useCSSVariable('--color-ink');

  async function pick() {
    const picked = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (picked.canceled) return;
    setBusy(true);
    try {
      const ref = await ImageManipulator.manipulate(picked.assets[0].uri).resize({ width: 512 }).renderAsync();
      const jpeg = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      onChange(await uploadAvatar(jpeg.uri));
      toast.info('Đã đổi ảnh đại diện.');
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Đổi ảnh đại diện"
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={pick}
      className="h-16 w-16 active:opacity-70">
      <View className={`h-16 w-16 items-center justify-center overflow-hidden rounded-full ${uri ? 'bg-well' : 'bg-tint'}`}>
        {uri ? (
          <Image
            // The signature in the URL changes on every load; cache on the object path instead.
            source={{ uri, cacheKey: path }}
            style={{ width: 64, height: 64 }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <Text className="text-[24px] font-black text-on-tint">{initials(me.fullName)}</Text>
        )}
        {busy ? (
          <View className="absolute inset-0 items-center justify-center bg-black/40">
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
      </View>
      <View className="absolute -right-1 -bottom-1 h-7 w-7 items-center justify-center rounded-full border-2 border-canvas bg-surface">
        <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }} size={14} tintColor={ink as string} />
      </View>
    </Pressable>
  );
}

/** Inset grouped list with an optional section label, rows separated by hairlines. */
function Group({ title, children }: { title?: string; children: ReactNode[] }) {
  return (
    <View className="gap-2">
      {title ? (
        <Text accessibilityRole="header" className="ml-4 text-[13px] font-semibold text-ink-muted">
          {title}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-line bg-surface">
        {children.map((row, i) => (
          <View key={i}>
            {i > 0 ? <View className="ml-14 h-px bg-line" /> : null}
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

type RowProps = { icon: SymbolViewProps['name']; label: string; value?: ReactNode; accent?: boolean; onPress?: () => void };

function Row({ icon, label, value, accent, onPress }: RowProps) {
  const muted = useCSSVariable('--color-ink-muted');
  // --color-tint is only declared in the light block, so read the JS palette (same tint in both themes).
  const tint = accent ? Colors.light.tint : (muted as string);
  if (onPress) {
    const chevron = <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={muted as string} />;
    return (
      <Pressable accessibilityRole="button" onPress={onPress} className="active:opacity-70">
        <Row icon={icon} label={label} accent={accent} value={chevron} />
      </Pressable>
    );
  }
  return (
    <View className="min-h-13 flex-row items-center gap-3 py-2.5 pr-4 pl-4">
      <View className="w-7 items-center">
        <SymbolView name={icon} size={20} tintColor={tint as string} />
      </View>
      <Text className="flex-1 text-[16px] text-ink">{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text numberOfLines={1} className="shrink text-right text-[16px] font-semibold text-ink-muted tabular-nums">
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

function ProfileSkeleton() {
  return (
    <SkeletonGroup>
      <View className="gap-7">
        <View className="flex-row items-center gap-4">
          <Bone className="h-16 w-16 rounded-full" />
          <View className="flex-1 gap-2">
            <Bone className="h-7 w-3/5" />
            <Bone className="h-4 w-4/5" />
          </View>
        </View>
        <Bone className="h-64 w-full rounded-2xl" />
        <Bone className="h-28 w-full rounded-2xl" />
      </View>
    </SkeletonGroup>
  );
}

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { data, setData, error, reload, refreshing, refresh } = useLoad(() => Promise.all([getMe(), getDashboard()]));
  const scheme = useColorScheme() === 'dark';
  // Re-theming re-renders the whole app, so the switch flips first and the theme follows once its thumb has moved.
  const [pending, setPending] = useState<boolean | null>(null);
  const dark = pending ?? scheme;
  function toggleTheme(on: boolean) {
    setPending(on);
    setTimeout(() => {
      Appearance.setColorScheme(on ? 'dark' : 'light');
      setPending(null);
    }, 200);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-7 px-5 pt-4 pb-32"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <Text accessibilityRole="header" className="text-[30px] leading-9 font-black tracking-[-0.5px] text-ink">
          Hồ sơ
        </Text>

        {!data ? (
          error ? (
            <Retry onPress={reload} />
          ) : (
            <ProfileSkeleton />
          )
        ) : (
          <>
            <View className="flex-row items-center gap-4">
              <Avatar me={data[0]} onChange={(me) => setData((d) => d && [me, d[1]])} />
              <View className="flex-1">
                <Text numberOfLines={2} className="text-[24px] leading-8 font-extrabold text-ink">
                  {data[0].fullName}
                </Text>
                <Text numberOfLines={1} className="mt-0.5 text-[15px] text-ink-muted">
                  {data[0].email}
                </Text>
              </View>
            </View>

            <Group title="Hành trình học">
              {[
                <Row
                  key="streak"
                  accent
                  icon={{ ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' }}
                  label="Chuỗi hiện tại"
                  value={`${data[1].streak.current} ngày`}
                />,
                <Row
                  key="best"
                  icon={{ ios: 'trophy.fill', android: 'emoji_events', web: 'emoji_events' }}
                  label="Kỷ lục"
                  value={`${data[1].streak.longest} ngày`}
                />,
                <Row
                  key="lessons"
                  icon={{ ios: 'book.fill', android: 'menu_book', web: 'menu_book' }}
                  label="Bài đã học"
                  value={data[1].totals.completedLessons}
                />,
                <Row
                  key="quiz"
                  icon={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }}
                  label="Lần làm bài kiểm tra"
                  value={data[1].totals.quizAttempts}
                />,
                <Row
                  key="paths"
                  icon={{ ios: 'map.fill', android: 'map', web: 'map' }}
                  label="Lộ trình"
                  value={data[1].totals.paths}
                />,
              ]}
            </Group>

            <Group title="Cài đặt">
              {[
                <Row
                  key="theme"
                  icon={{ ios: 'moon.fill', android: 'dark_mode', web: 'dark_mode' }}
                  label="Giao diện tối"
                  value={
                    <Switch
                      accessibilityLabel="Giao diện tối"
                      value={dark}
                      onValueChange={toggleTheme}
                      trackColor={{ true: Colors.light.tint }}
                      thumbColor="#FFFFFF"
                    />
                  }
                />,
              ]}
            </Group>

            <Group title="Tài khoản">
              {[
                <Row
                  key="profile"
                  icon={{ ios: 'person.fill', android: 'person', web: 'person' }}
                  label="Sửa họ tên và ngày sinh"
                  onPress={() =>
                    router.push({
                      pathname: '/edit-profile',
                      params: { fullName: data[0].fullName, dateOfBirth: data[0].dateOfBirth },
                    })
                  }
                />,
                <Row
                  key="password"
                  icon={{ ios: 'key.fill', android: 'key', web: 'key' }}
                  label="Đổi mật khẩu"
                  onPress={() => router.push('/change-password')}
                />,
                <Row
                  key="delete"
                  icon={{ ios: 'trash.fill', android: 'delete', web: 'delete' }}
                  label="Xoá tài khoản"
                  onPress={() => router.push('/delete-account')}
                />,
              ]}
            </Group>
          </>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => signOut()}
          className="min-h-13 items-center justify-center rounded-2xl border border-line bg-surface active:opacity-70">
          <Text className="text-base font-bold text-tint-ink">Đăng xuất</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

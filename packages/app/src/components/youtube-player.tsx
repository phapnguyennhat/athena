import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { WebView } from 'react-native-webview';

import { Text, View } from '@/tw';

// Ids come from the API (validated there); re-check before putting one into HTML.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// Embeds loaded without a referrer fail with player error 153, so the page gets an https base URL.
const BASE_URL = 'https://athena.app';

const html = (id: string) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style>
</head><body>
<iframe src="https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1"
  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
  referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</body></html>`;

/** In-app YouTube player (16:9). Only YouTube's own pages may load inside it; any other link opens in the browser. */
export function YouTubePlayer({ videoId, title }: { videoId: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!VIDEO_ID.test(videoId)) return null;
  return (
    <View className="aspect-video overflow-hidden rounded-2xl bg-black" accessibilityLabel={`Video: ${title}`}>
      {failed ? (
        <View className="flex-1 items-center justify-center p-4">
          <Text className="text-center text-[14px] text-white">Không phát được video trong ứng dụng.</Text>
        </View>
      ) : (
        <WebView
          source={{ html: html(videoId), baseUrl: BASE_URL }}
          originWhitelist={['https://*']}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          onError={() => setFailed(true)}
          onShouldStartLoadWithRequest={(req) => {
            // Sub-frames (the player's own ads/assets) stay inside; only top-level navigations are filtered.
            if (req.isTopFrame === false) return true;
            const host = req.url.startsWith('about:') ? 'about' : new URL(req.url).hostname;
            if (req.url.startsWith(BASE_URL) || host === 'about' || /(^|\.)youtube(-nocookie)?\.com$|(^|\.)google\.com$|(^|\.)ytimg\.com$|(^|\.)googlevideo\.com$/.test(host))
              return true;
            WebBrowser.openBrowserAsync(req.url);
            return false;
          }}
          style={{ flex: 1, backgroundColor: '#000' }}
        />
      )}
    </View>
  );
}

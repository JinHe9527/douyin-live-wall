import test from 'node:test';
import assert from 'node:assert/strict';
import douyinStreamModule from '../lib/douyin-stream.js';

const { resolveStream, parseEnterPayload, buildFlvCandidates, scrapePageStreams } = douyinStreamModule;

test('快速检查失败时不进入串行导航兜底', async () => {
  let navigationCalls = 0;
  const result = await resolveStream({
    apiRunJs: async () => ({ __ok: false, __reason: 'network-failed' }),
    withNav: async () => {
      navigationCalls += 1;
      return { __ok: false };
    },
  }, '6300864795', {
    quality: 'fluent',
    allowNavigationFallback: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'unknown');
  assert.equal(navigationCalls, 0);
});

test('完整解析仍会在 API 未知时使用导航兜底', async () => {
  let navigationCalls = 0;
  const result = await resolveStream({
    apiRunJs: async () => ({ __ok: false, __reason: 'network-failed' }),
    withNav: async (task) => {
      navigationCalls += 1;
      return task(
        async () => {},
        async () => ({
          __ok: true,
          __scrape: {
            flv: { SD2: 'https://example.com/live.flv' },
            hls: {},
            status: 'live',
          },
        }),
      );
    },
  }, '6300864795', { quality: 'fluent' });

  assert.equal(result.ok, true);
  assert.equal(result.flvUrl, 'https://example.com/live.flv');
  assert.equal(navigationCalls, 1);
});

test('快速检查主播主页时不进入导航队列', async () => {
  let navigationCalls = 0;
  const result = await resolveStream({
    apiRunJs: async () => ({ __ok: false }),
    withNav: async () => {
      navigationCalls += 1;
      return '';
    },
  }, 'https://www.douyin.com/user/example', {
    allowNavigationFallback: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.deferred, true);
  assert.equal(navigationCalls, 0);
});

function makePayload() {
  return {
    data: {
      data: [{
        status: 2,
        title: '宇宙101',
        stream_url: {
          flv_pull_url: {
            SD2: 'http://pull-flv-t6.douyincdn.com/live.flv?line=direct',
            SD1: 'http://pull-flv-t6.douyincdn.com/live.flv?line=direct-sd',
          },
          pull_datas: {
            h264: {
              stream_data: JSON.stringify({
                data: {
                  ld: {
                    main: {
                      flv: 'http://pull-t5.douyincdn.com/live.flv?line=main',
                      sdk_params: JSON.stringify({ VCodec: '264', resolution: '480x853' }),
                    },
                    backup: {
                      flv: 'http://pull-t26.douyincdn.com/live.flv?line=backup',
                      sdk_params: JSON.stringify({ VCodec: '264', resolution: '480x853' }),
                    },
                  },
                },
              }),
            },
          },
        },
      }],
      user: { nickname: '101' },
    },
  };
}

test('接口结果保留 stream_data 的主备 CDN 候选', () => {
  const parsed = parseEnterPayload(makePayload());
  const candidates = buildFlvCandidates(parsed, 'fluent');

  assert.equal(parsed.ok, true);
  assert.deepEqual(candidates.slice(0, 3).map((item) => item.host), [
    'pull-flv-t6.douyincdn.com',
    'pull-t5.douyincdn.com',
    'pull-t26.douyincdn.com',
  ]);
  assert.ok(candidates.slice(0, 3).every((item) => item.url.startsWith('https://')));
  assert.ok(candidates.some((item) => item.url.startsWith('http://')));
});

test('页面兜底能解析转义 JSON 并收集多个 CDN', () => {
  const scriptText = [
    String.raw`self.x="{\"stream_url\":{\"flv_pull_url\":{\"SD2\":\"http:\/\/pull-flv-t6.douyincdn.com\/a.flv?x=1\"}}}";`,
    String.raw`self.y="{\"stream_url\":{\"flv_pull_url\":{\"SD2\":\"http:\/\/pull-t5.douyincdn.com\/b.flv?x=2\"}}}";`,
  ].join('\n');
  const document = {
    documentElement: { innerHTML: '' },
    querySelectorAll: (selector) => selector === 'script' ? [{ textContent: scriptText }] : [],
    querySelector: () => null,
  };

  const result = scrapePageStreams(document);

  assert.equal(result.__ok, true);
  assert.deepEqual(result.__scrape.flvCandidates.map((item) => new URL(item.url).hostname), [
    'pull-flv-t6.douyincdn.com',
    'pull-t5.douyincdn.com',
  ]);
});

test('播放器要求强制导航时采用页面备用线路而非重复 API 首选线路', async () => {
  let navigated = false;
  const result = await resolveStream({
    apiRunJs: async () => ({ __ok: true, __json: makePayload() }),
    withNav: async (run) => run(
      async () => { navigated = true; },
      async () => ({
        __ok: true,
        __scrape: {
          flv: { SD2: 'http://pull-t5.douyincdn.com/page.flv?x=1' },
          flvCandidates: [{ key: 'SD2', url: 'http://pull-t5.douyincdn.com/page.flv?x=1' }],
        },
      }),
    ),
  }, '435664339946', {
    quality: 'fluent',
    allowNavigationFallback: true,
    forceNavigationFallback: true,
  });

  assert.equal(navigated, true);
  assert.equal(result.via, 'scrape');
  assert.equal(new URL(result.flvUrl).hostname, 'pull-t5.douyincdn.com');
  assert.equal(result.flvUrl.startsWith('https://'), true);
});

test('接口明确下播时即使请求强制兜底也不采用页面旧流', async () => {
  let navigated = false;
  const endedPayload = makePayload();
  endedPayload.data.data[0].status = 4;
  delete endedPayload.data.data[0].stream_url;

  const result = await resolveStream({
    apiRunJs: async () => ({ __ok: true, __json: endedPayload }),
    withNav: async () => {
      navigated = true;
      return { __ok: false };
    },
  }, '435664339946', {
    quality: 'fluent',
    allowNavigationFallback: true,
    forceNavigationFallback: true,
  });

  assert.equal(result.status, 'ended');
  assert.equal(navigated, false);
});

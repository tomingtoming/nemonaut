# 利用状況の計測

Nemonautは、どう遊ばれているかを知るために匿名の利用統計を集めています。この文書は、何を・なぜ・どう記録し、どう読むかをまとめたものです。

- 実装：[`src/metrics.ts`](../src/metrics.ts)（ブラウザ側）→ 同じオリジンの `POST /metric` → [`worker/metric.ts`](../worker/metric.ts)（入口は [`worker/index.ts`](../worker/index.ts)）→ Workers Analytics Engine のデータセット `nemonaut_play`
- 試験：[`tests/metrics.test.mjs`](../tests/metrics.test.mjs)（ブラウザ側の純粋な部分）、[`tests/worker-metric.test.mjs`](../tests/worker-metric.test.mjs)（Workerの検査と列の並び）

## なぜページ閲覧数だけでは足りないか

配信側ではCloudflare Web Analyticsがページの閲覧数と訪問数を数えています。しかし閲覧数からは、見本機を開いたか、出発したか、軌道に届いたか、どれだけの時間画面を見ていたかは分かりません。Workers Logsは保持が短くSQLで集計できないので、障害の調査用です。Workers Analytics Engineは3か月保持し、SQLで読め、無料枠（書き込み1日10万点、読み出し1日1万クエリ）が1訪問あたり数点という量に対して十分に大きいので、これを使っています。無料枠はアカウント全体で共有なので、1訪問あたりの点数は少なく保ちます。

## プライバシー

- アカウントはなく、Cookieも使いません。
- IPアドレスは保存しません。Workerは送信元アドレスを回数制限の鍵としてだけ使います。
- **入力された文字は送りません。** 機体名、設計名など、入力欄から来るものは一切送りません。送るのは、ゲームに組み込まれた識別子（見本機、出発地点、到達記録、自動操縦、破損原因の種類、部品の性質の印）と数値だけです。機体の設計や保存データも送りません。
- Workerは受け取った文字列を、組み込みの識別子の形（英小文字・数字・ハイフン）に合うときだけ保存します。合わないものは切り詰めずに空にします。数値は範囲に収めます。
- 同じ人の再訪と別の人を数え分けるために、乱数の識別子を1つ、localStorageの `nemonaut-visitor` に置きます（`{id, first, visits}`：識別子、初回の日付、訪問回数）。用途はそれだけです。
- 接続先のホスト名と国は、Workerがリクエストから付けます。ブラウザからは送りません。

## 止め方と印の付け方

| URL | 効果 |
|---|---|
| `?metrics=off` | そのブラウザからは以後何も送りません（localStorageの `nemonaut-metrics` に記憶）。 |
| `?metrics=dev` | そのブラウザの行に audience `dev` の印を付けます。開発や動作確認の端末を集計から除くためのものです（同じく記憶）。 |
| `?metrics=public` | 上の2つを取り消し、通常（audience `public`）に戻します。 |

一度開けば記憶されるので、次からはURLに付ける必要はありません。localStorageが使えないブラウザでは、そのページ読み込みの間だけ効きます。

## 出来事

1行が1つの出来事です。出来事は1.5秒ぶんをまとめて1回のリクエストで送り、ページを離れるとき・隠れるときは `sendBeacon` で送ります。

| event | いつ | 列 |
|---|---|---|
| `session` | ページ読み込みごとに1回。最初の画面が描かれた時点（kind = `ready`）。それより前にタブが隠れた・ページを離れた場合はその時点（kind = `noframe`） | kind、ms（ナビゲーション開始から最初の描画まで。`noframe` は0）、ref（参照元ホスト。別オリジンのときだけ）、visits（このブラウザの訪問回数。初回が1、記憶できないブラウザは0）、days（初回訪問からの日数） |
| `session-end` | `pagehide`（ページを離れるとき）に1回 | kind = `left`、secs（タブが見えていた秒数）、hidden（隠れていた秒数。secsには含まれない）、centre / workshop / flight（宇宙センター・組立棟・飛行の各画面が見えていた秒数）、edits（組立棟での変更回数）、launches（出発回数）、failures（破損した部品の数） |
| `launch` | 機体が出発した | kind（`world` = 通常の世界への出発、`practice` = 独立した練習）、env（出発地点：`land` `runway` `water`、練習配置の `drop` `orbit` `entry` `moon-orbit` `moon-surface` `transfer`）、parts（部品数）、example（変更していない見本機ならその識別子、それ以外は `custom`）、traits（機体の性質） |
| `milestone` | 到達記録が世界の履歴に付いた | kind（`orbit` `moon-arrival` `moon-landing` `delivery` `survey` `precision-landing` `recover`）、body（天体：`planet` `moon`。記録に天体がなければ空） |
| `example` | 見本機を開いた | example（見本機の識別子） |
| `autopilot` | 自動操縦を始めた | kind（`ascent` `maneuver` `cruise` `takeoff` `landing` `return` `docking` `launch-demo` `return-demo`） |
| `craft-file` | 機体JSONを書き出した・読み込んだ | kind（`export` / `import`）、parts（部品数） |
| `failure` | 部品が壊れた | kind（原因：`impact` `thermal` `structural`） |

どの行にも、entry（`fresh` = 保存された世界なし、`resume` = 保存された世界を復元）、device（`desktop` / `touch`）、ui（表示言語 `ja` / `en`）、lang（ブラウザの言語設定）、audience、sid（1回のページ読み込みを束ねる乱数）、build（ビルド元コミットの短縮形）が付きます。

補足：

- **通常の遊びと練習の区別**：`launch` の kind で分かれます。`milestone` は通常の世界でだけ記録されます（練習では履歴を書かないため）。
- **traits** は、部品カタログの性質から導いた印をカンマでつないだものです（名前からは判断しません）。順序は固定で、`wing`（翼・フィン・舵面）、`wheel`（車輪）、`drive`（動力付き車輪）、`screw`（スクリュー）、`rocket`（ロケットエンジン）、`jet`（ジェットエンジン）、`dock`（ドッキングポート）、`chute`（パラシュート）、`rcs`、`leg`（着陸脚）、`shield`（熱シールド）、`solar`（太陽電池）、`float`（浮力体）、`ballast`（注排水タンク）、`cargo`（貨物室）、`sep`（分離装置）。例：`wing,wheel,jet`。
- **example** は、部品の種類・位置・向き・親子関係・段・切替が見本機と同じかどうかで判定します。同じ機体で出発地点だけが違う見本機（例：`hopper` `lander` `moonlander`）は、出発地点が一致するものを選びます。
- **failure** は、1回のページ読み込みにつき最初の3行だけ送ります。機体がばらばらになっても数行で済ませるためで、全体の数は `session-end` の failures に入ります。
- 1回のページ読み込みで送る行は、`session` と `session-end` を除いて120行までです。
- **秒数は「見えていた時間」** です。隠れたタブは描画しないので、壁時計で測ると置きっぱなしのタブが何時間にもなります。hidden を並べて送るので、引き算は検算できます。
- 典型的な1訪問は、`session`、`example`、`launch`、`autopilot` か `milestone` が1〜2、`failure` が0〜3、`session-end` で、5〜8行（リクエストは3〜5回）です。何もせずに閉じた訪問は2行です。

## 列（`nemonaut_play`）

SQLはこの並びを前提にします（[`worker/metric.ts`](../worker/metric.ts) の `COLUMNS`）。列を足すときは末尾に足します。`index1` は訪問者の識別子（サンプリングの鍵）です。

| 列 | 内容 |
|---|---|
| `blob1` | event（出来事の名前） |
| `blob2` | kind（出来事ごとの種類。上の表） |
| `blob3` | entry `fresh` / `resume` |
| `blob4` | env（出発地点。`launch`） |
| `blob5` | example（見本機の識別子または `custom`。`launch` と `example`） |
| `blob6` | traits（機体の性質。`launch`） |
| `blob7` | body（天体。`milestone`） |
| `blob8` | device `desktop` / `touch` |
| `blob9` | ui（表示言語）`ja` / `en` |
| `blob10` | lang（ブラウザの言語設定。例 `ja-JP`） |
| `blob11` | ref（参照元ホスト。`session`） |
| `blob12` | audience `public` / `dev` |
| `blob13` | sid（1回のページ読み込みの行を束ねる） |
| `blob14` | build（ビルド元コミット。gitなしのビルドは `dev`） |
| `blob15` | host（**Workerが付ける**：リクエストのホスト名） |
| `blob16` | country（**Workerが付ける**：国コード） |
| `double1` | secs（見えていた秒数。`session-end`） |
| `double2` | hidden（隠れていた秒数。`session-end`） |
| `double3` | centre（宇宙センターの秒数。`session-end`） |
| `double4` | workshop（組立棟の秒数。`session-end`） |
| `double5` | flight（飛行の秒数。`session-end`） |
| `double6` | edits（組立棟での変更回数。`session-end`） |
| `double7` | launches（出発回数。`session-end`） |
| `double8` | failures（破損した部品の数。`session-end`） |
| `double9` | visits（訪問回数。`session`） |
| `double10` | days（初回訪問からの日数。`session`） |
| `double11` | ms（最初の描画までのミリ秒。`session`） |
| `double12` | parts（部品数。`launch` と `craft-file`） |

## 読み方

Analytics EngineのSQL APIは、wranglerにログインしたときのOAuthトークンで読めます。トークンが期限切れなら `npx wrangler whoami` で更新されます。

```sh
TOK=$(grep '^oauth_token' ~/.wrangler/config/default.toml | sed 's/.*= *"//;s/"//')
ACC=$(npx wrangler whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)
q() { curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACC/analytics_engine/sql" \
        -H "Authorization: Bearer $TOK" -H 'Content-Type: text/plain' --data "$1"; }
q "SELECT timestamp, blob1 AS event, blob2 AS kind, blob12 AS audience, blob14 AS build, blob15 AS host
   FROM nemonaut_play ORDER BY timestamp DESC LIMIT 20"
```

### 先に方言

Analytics EngineのSQLはClickHouseの部分集合で、**結果をサンプリングします**。返る行はそれぞれ `_sample_interval`（その行が代表する実際の行数）を持ちます。

| ほしいもの | 使わない | 使う |
|---|---|---|
| 件数 | `count()` | `sum(_sample_interval)` |
| 条件付きの件数 | `countIf(c)` | `sumIf(_sample_interval, c)` |
| 平均 | `avg(x)` | `sum(x * _sample_interval) / sum(_sample_interval)` |
| 中央値 | `quantile(0.5)(x)` | `quantileExactWeighted(0.5)(x, _sample_interval)` |
| 訪問者数 | — | `count(DISTINCT index1)`（サンプリング下では**下限**） |

量が少ないうちはどの行も `_sample_interval = 1` で、`count()` でもたまたま合います。量が増えると同じクエリが黙って少なく数えるので、最初から重み付きの形で書きます。

### クエリ集（公開の訪問、本番、直近7日）

```sql
-- 日ごとのセッション数、訪問者数、初回訪問の数
SELECT toDate(timestamp) AS day,
       sum(_sample_interval) AS sessions,
       count(DISTINCT index1) AS visitors_lower_bound,
       sumIf(_sample_interval, double9 = 1) AS first_visits
FROM nemonaut_play
WHERE blob1 = 'session' AND blob12 = 'public' AND blob15 = 'nemonaut.toming.app'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY day ORDER BY day
```

```sql
-- 何が行われたか：出来事と種類ごとの件数
SELECT blob1 AS event, blob2 AS kind, sum(_sample_interval) AS n, count(DISTINCT index1) AS visitors_lower_bound
FROM nemonaut_play
WHERE blob12 = 'public' AND blob15 = 'nemonaut.toming.app' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY event, kind ORDER BY n DESC
```

```sql
-- 滞在時間（見えていた秒数）と、画面ごとの内訳、出発まで行った割合
SELECT quantileExactWeighted(0.5)(double1, _sample_interval) AS median_secs,
       quantileExactWeighted(0.9)(double1, _sample_interval) AS p90_secs,
       sum(double3 * _sample_interval) / sum(_sample_interval) AS mean_centre,
       sum(double4 * _sample_interval) / sum(_sample_interval) AS mean_workshop,
       sum(double5 * _sample_interval) / sum(_sample_interval) AS mean_flight,
       sumIf(_sample_interval, double7 > 0) / sum(_sample_interval) AS launched_share
FROM nemonaut_play
WHERE blob1 = 'session-end' AND blob12 = 'public' AND blob15 = 'nemonaut.toming.app'
  AND timestamp > NOW() - INTERVAL '7' DAY
```

```sql
-- どの機体がどこから出発したか
SELECT blob5 AS example, blob4 AS env, blob2 AS mode, sum(_sample_interval) AS launches,
       quantileExactWeighted(0.5)(double12, _sample_interval) AS median_parts
FROM nemonaut_play
WHERE blob1 = 'launch' AND blob12 = 'public' AND blob15 = 'nemonaut.toming.app'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY example, env, mode ORDER BY launches DESC LIMIT 40
```

```sql
-- 自作機の性質（翼のある機体の割合など）
SELECT sumIf(_sample_interval, blob6 LIKE '%wing%') AS winged,
       sumIf(_sample_interval, blob6 LIKE '%jet%') AS jets,
       sumIf(_sample_interval, blob6 LIKE '%screw%') AS boats,
       sumIf(_sample_interval, blob6 LIKE '%dock%') AS with_port,
       sum(_sample_interval) AS custom_launches
FROM nemonaut_play
WHERE blob1 = 'launch' AND blob5 = 'custom' AND blob12 = 'public' AND timestamp > NOW() - INTERVAL '30' DAY
```

```sql
-- 到達記録
SELECT blob2 AS milestone, blob7 AS body, sum(_sample_interval) AS n, count(DISTINCT index1) AS visitors_lower_bound
FROM nemonaut_play
WHERE blob1 = 'milestone' AND blob12 = 'public' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY milestone, body ORDER BY n DESC
```

```sql
-- 最初の描画まで何ミリ秒か、描画に至らなかった読み込みはいくつか（端末別）
SELECT blob8 AS device,
       sum(_sample_interval) AS sessions,
       sumIf(_sample_interval, blob2 = 'noframe') AS never_drew,
       quantileExactWeighted(0.5)(double11, _sample_interval) AS median_ms,
       quantileExactWeighted(0.9)(double11, _sample_interval) AS p90_ms
FROM nemonaut_play
WHERE blob1 = 'session' AND blob12 = 'public' AND blob15 = 'nemonaut.toming.app'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY device
-- 分位は noframe の行を0 msとして含む。描画時間だけを見るなら blob2 = 'ready' を条件に足す
```

## 流れているかの確認

クエリを使わずに確かめる方法：Workerは1回の送信ごとに1行（`[metric] {"n":…,"host":…,"cc":…,"aud":…,"build":…}`）をログに出します。observabilityを有効にしてあるので、CloudflareのダッシュボードのWorkerのログで見えます。書き込みが止まったデータセットは「誰も来ていない」のと同じに見えるので、訪問があったはずの時間にこの行がないことが合図になります。データセットへの書き込みが失敗したときは `[metric] writeDataPoint failed` が出ます。

データセットは、最初の書き込みのときに自動的に作られます。配信後、最初の行が入るまではSQLが「テーブルがない」というエラーを返します。

## Workerの検査

`POST /metric` は順に次を確かめ、どれも例外を外へ出しません。

1. `POST` 以外は405。
2. 別のオリジンからの送信は403。ブラウザが付ける `Sec-Fetch-Site` が `same-origin` でなければ断り、このヘッダーがない場合は `Origin` が自分のオリジンと違えば断ります。
3. `Content-Type` が `application/json` でなければ415。
4. 送信元アドレスごとに1分30回まで（Workers Rate Limiting）。超えたら429。この束縛がない・失敗した場合は通します。
5. 本文は8192バイトまで。超えたら413（読み込みも途中で打ち切ります）。
6. JSONでない、`events` が配列でない場合は400。
7. 1回の送信につき20個まで。名前が一覧にない出来事は捨てます。文字列は形が合うものだけ、数値は範囲に収めて保存します。

`/metric` 以外のパスは静的ファイルの層へ渡すので、存在しないページの404は静的ファイルの層が返します。

## 覚えておく限界

1. `count(DISTINCT index1)` は、サンプリング下では下限です。
2. localStorageを消した人、プライベートブラウズの人は、毎回新しい訪問者になります（後者は `visits = 0`）。
3. 計測を入れた配信の後の最初の読み込みは、以前から遊んでいた人でも `visits = 1` です。前から遊んでいたかどうかは entry = `resume` で分かります。
4. `session-end` は `pagehide` で送ります。モバイルのブラウザは裏に回したタブを `pagehide` なしで破棄することがあり、その訪問には `session-end` がありません（それまでの行は、タブが隠れた時点で送ってあります）。`session` の数より `session-end` が少ないのは正常です。
5. 裏のタブで開かれたページは、描画の前に隠れているので `session` が `noframe` になります。あとで表に出て遊ばれた場合、同じ sid の `session-end` の秒数で分かります。
6. edits は取り消し履歴に積んだ回数なので、見本機を開くのも1回に数えます。
7. `launch` の example は構造の一致で決めるので、見本機と偶然まったく同じ機体を一から組んだ場合も見本機として数えます。
8. 広告ブロッカーなどが `/metric` への送信を止めることがあります。その訪問は数えられません。

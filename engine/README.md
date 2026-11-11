# 物理エンジン

このクレート（`orbital-engine`）はNemonautの唯一の物理です。[Rapier](https://rapier.rs/) の剛体ソルバーと、飛行の1ステップごとに行う数値計算（翼、抗力、水、燃料、電力、熱、軌道）をRustで書き、WebAssemblyへコンパイルします。ゲームはその成果物 `src/engine/orbital_engine.wasm` を読み込みます。JavaScript側に物理の別実装はありません。

- Rapierはgitのリビジョンで固定しています：<https://github.com/dimforge/rapier/tree/b716d375efc0201003f0cd9ef7168eee0b62c177>（クレートの版は0.36.0。npmの `@dimforge/rapier3d-compat` 0.21.0 と同じソース）。推移的な依存は `Cargo.lock` で固定しています。
- Wasmはimportを持ちません。JavaScriptからは数値の引数と戻り値、および線形メモリ上の配列でやり取りします。
- 1つのWasmインスタンスが1機体分のRapierの世界を持ちます。機体ごとにインスタンスを作ります。
- ソルバーは反復8回、CCD有効、スリープ無効です。ソルバー内の座標は機体近傍の局所座標（f32）で、天体規模の位置と速度はf64で別に扱います。

## 構成

| ファイル | 内容 |
|---|---|
| `src/craft.rs` | 1機体のRapierの世界：剛体、コライダー、地面、ステップ、接地の読み出し |
| `src/pair.rs` | 2機体のコライダー間の接触の検出（検出だけ。世界は進めない） |
| `src/wing.rs` | 翼と操舵面の荷重 |
| `src/body_drag.rs` | 胴体の抗力の形状と、向きごとの投影面積 |
| `src/water.rs` | 浮力と水の抵抗 |
| `src/fuel.rs` | 燃料の消費と、エンジンへ届く推力 |
| `src/charge.rs` | 電力の配分 |
| `src/thermal.rs` | 空力加熱と部品の温度、アブレーター |
| `src/coast_cooling.rs` | 高速航行中の放射冷却 |
| `src/kepler.rs` | 普遍変数によるケプラー伝播 |
| `src/celestial.rs` | 母星・月の重力のもとでの速度ベルレ法の1ステップ |
| `src/kernel.rs` | 照合用の最小の世界（`diagnostics` フィーチャーのときだけ含まれる） |

## 公開している関数

ゲームは2通りの経路でエンジンを呼びます。

### `src/physics.ts` を通す経路

`src/physics.ts` は、RapierのJavaScript APIのうちゲームが使う部分（World、RigidBody、Collider）を同じ名前で提供する層です。各メソッドは、rapier.js 0.21 のバインディングが呼ぶのと同じRapierのメソッドを呼ぶので、値（f32での保持、クォータニオンの正規化、質量特性、力の蓄積）はJavaScript版のRapierと一致します。`tests/physics-facade.test.mjs` がnpmのRapierと比べて確かめます。

| 目的 | 関数 |
|---|---|
| 世界の作成と破棄 | `craft_reset`、`craft_dispose` |
| コライダー | `craft_shape`（直方体・球の追加）、`craft_clear_shapes`、`craft_mass`、`shape_get` |
| 剛体の状態 | `body_set_translation`、`body_set_rotation`、`body_set_velocity`、`body_get`（位置、速度、姿勢、角速度、質量、質量中心、主慣性モーメントとその座標系、蓄積した力とトルク）、`body_recompute_mass` |
| 力 | `body_reset_forces`、`body_add_force_at_point`、`body_add_torque` |
| 地面 | `ground_set`（半幅2000 × 1 × 2000 mの静的な箱の姿勢・有効無効・摩擦） |
| ステップ | `world_step`（重力、時間刻み、長さの単位、接触の許容誤差を引数に取り、蓄積済みの力で1ステップ進める） |
| 接地の読み出し | `craft_contact_count`、`craft_contact_impulse`（コライダーごとの地面との接触点と法線インパルス）、`craft_ground_support`（正の法線インパルスを持つ接触点があるか） |

### 計算カーネルを直接呼ぶ経路

1ステップ分の計算をまとめて行う関数です。呼び出し側が線形メモリに行（部品ごとの入力）を書き、結果を同じ場所から読みます。

| 目的 | 関数 | 呼び出し元 |
|---|---|---|
| 機体どうしの接触 | `pair_reset`、`pair_shape`、`pair_pose`、`pair_query`、`pair_read` | `src/vessel-collision.ts` |
| 翼の荷重 | `wing_prepare`、`wing_batch` | `src/wing-loads.ts` |
| 胴体の抗力 | `drag_create`、`drag_rows`、`drag_area`、`drag_release` | `src/body-drag.ts` |
| 水の荷重 | `water_prepare`、`water_step` | `src/water-loads.ts` |
| 燃料 | `fuel_prepare`、`fuel_burn_vessel` | `src/resources.ts` |
| 電力 | `charge_prepare`、`charge_distribute` | `src/power.ts` |
| 熱 | `thermal_register`、`thermal_states`、`thermal_step`、`thermal_part_count`、`thermal_release` | `src/flight-thermal.ts` |
| 高速航行中の冷却 | `coast_cooling_prepare`、`coast_cooling_step` | `src/coast-flight.ts` |
| ケプラー伝播 | `kepler_drift` | `src/coast-orbit.ts` |
| 天体のもとでの1ステップ | `celestial_advance` | `src/celestial.ts` |

`pair_*` は、呼び出し側が接触点の近くに選んだ共通の局所座標に2機体のコライダーを置き、指定した距離より近い組をすべて返します。インパルスの解決はゲーム側（`src/vessel-collision.ts`）が行います。熱の計算は機体の世界と同じインスタンスで行い、それ以外のカーネルはページ・Worker・Node.jsのプロセスごとに1つの共用インスタンスで行います（`sharedPhysics`）。

このほかに `craft_ground`（`ground_set` の内部で使う、クォータニオンを正規化せずに受け取る版）も公開されていますが、ゲームが直接呼ぶことはありません。

入力は有限な値かどうかを検査します。不正な入力に対しては、状態を変えずに0、NaN、または負の値を返します（関数ごとの意味はソースのコメントにあります）。

## `diagnostics` フィーチャー

`--features diagnostics` を付けてビルドすると、照合用の関数が加わります。ゲームが使うWasmには含まれません。

- `fall_y`、`kernel_*`：固定の球または箱を1つだけ持つ最小の世界。120 Hzのステップ、状態の読み出し、原点の移動、操作列の保存と復元。
- `craft_step`、`craft_read`：機体の世界に、1点への力を与えて120 Hzで1ステップ進める関数と、状態の読み出し。

これを使うのは `tools/golden/` の3つのスクリプトです。いずれもnpmのRapier（JavaScript版のソルバー）と同じ入力を与えて結果を比べます。

| スクリプト | 比べるもの |
|---|---|
| `node tools/golden/compare-kernel.mjs` | 自由落下と接地、力とトルクの印加と解除、不正な入力の拒否、インスタンスの独立 |
| `node tools/golden/checkpoint-kernel.mjs` | 操作列の保存と別インスタンスでの復元、原点の移動、読み込み失敗時の復旧 |
| `node tools/golden/craft-kernel.mjs` | 見本機の実際のコライダー、質量と質量中心の変化、重心を外れた力（先に `npm run build` が必要） |

スクリプトは `engine/target/orbital_engine_diagnostics.wasm` を読みます。別の場所のファイルを使うときは環境変数 `ENGINE_DIAGNOSTICS_WASM` にパスを指定します。

## ビルド

**ビルドは必ず `tools/build-engine.sh` で行います。**

```sh
bash tools/build-engine.sh            # 2種類をビルドし、SHA-256を表示する
bash tools/build-engine.sh --check    # さらに、製品版が src/engine/orbital_engine.wasm と一致しなければ失敗する
bash tools/build-engine.sh --update   # さらに、製品版を src/engine/orbital_engine.wasm へコピーする
```

必要なもの：rustupと、ツールチェーン1.97.0および `wasm32-unknown-unknown` ターゲット。

```sh
rustup toolchain install 1.97.0 --profile minimal --target wasm32-unknown-unknown
```

出力（`$CARGO_TARGET_DIR`、既定では `engine/target` の下）：

| ファイル | 内容 |
|---|---|
| `wasm32-unknown-unknown/release/orbital_engine.wasm` | 製品版（既定のフィーチャー） |
| `orbital_engine_diagnostics.wasm` | `diagnostics` 付き。照合スクリプト用 |

`engine/` を変更したら `--update` を実行し、更新された `src/engine/orbital_engine.wasm` を一緒にコミットします。CI（`.github/workflows/rust-kernel.yml`）は同じスクリプトでビルドし、3つの照合スクリプトと基準再生を実行したうえで `--check` を実行します。コミット済みのWasmがソースのビルド結果とバイト単位で一致しなければ失敗します。

### 素の `cargo build` を使わない理由

rustcは、panicが起こりうる箇所ごとにソースファイルのパスをバイナリに埋め込みます。依存クレートのソースは `$CARGO_HOME` の下にあるので、素の `cargo build` の出力にはビルドした環境のパスが入り、環境ごとにバイト列が変わります。

`tools/build-engine.sh` は次のようにして、出力を環境に依存しないものにしています。

- リポジトリのルートと `$CARGO_HOME` を固定の接頭辞（`/nemonaut`、`/cargo`）へ置き換える `--remap-path-prefix` を渡します。
- フラグは `CARGO_ENCODED_RUSTFLAGS` で渡し、`RUSTFLAGS` と `CARGO_BUILD_RUSTFLAGS` を消します。`CARGO_ENCODED_RUSTFLAGS` はcargoの設定ファイルのrustflagsより優先されるので、環境に設定されたフラグはビルドに入りません。
- ツールチェーンを `cargo +1.97.0` で、依存を `--locked` で固定します。
- ビルド後、出力に環境固有の絶対パス（`/home/…`、`/Users/…` など）が残っていれば失敗します。

その結果、出力のバイト列は `$HOME`、`$CARGO_HOME`、チェックアウトした場所、ターゲットディレクトリに依存しません。

残る注意点が1つあります。ユーザー単位のcargo設定（`$CARGO_HOME/config.toml` など）で `[profile.release]` を上書きしていると、最適化の設定が変わり、出力も変わります。`--check` が一致しないときは、まずこれを確認してください。

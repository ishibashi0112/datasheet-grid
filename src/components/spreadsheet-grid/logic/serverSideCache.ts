// serverSide(SSRM)の取得済みブロックを保持するクライアント側スパースキャッシュです
// (React 非依存・LRU で有界化)。
//
// 役割と不変条件(SSRM の急所・続き):
//   computeBlockIndexes が「1 リクエストを定数サイズに縛る」一方、スクロールで取り溜めた過去
//   ブロックは放置すると累積して全件保持に近づきます。本キャッシュは maxBlocks の LRU 上限で
//   画面外の冷たいブロックを退避し、常駐量を「総件数に依らず O(定数)」へ張り付けます。
//   → SSRM の意義(取得範囲を定数に縛りメモリを有界化)を、ブロック算出と LRU の二段で構造保証します。
//
// recency の扱い(重要):
//   getRow は recency を一切変えない純読みです。GridBodyLayer の render 中(rowModel.getRow)から
//   副作用なく呼べるようにするためで、render が LRU 順序を動かして evict 対象を揺らすのを防ぎます。
//   recency 更新は hook の effect から touchBlocks(可視ブロック)で明示的に行い、退避対象が常に
//   「いま画面に無い古いブロック」になるようにします。
//
//   JS の Map は挿入順を保持するため、これを LRU 順(先頭=最古 / 末尾=最新)として使います。
//   MRU 化 = delete してから set し直し(末尾へ移動)。evict = 先頭キー(最古)を削除。
//
// rowCount はここに持ちません(縦ジオメトリ駆動のため hook の state 側が単一ソースです)。

export type ServerSideRowCacheOptions = {
  // 1 ブロックの行数(view 空間で連続する行のまとまり)。
  blockSize: number;
  // 常駐させる最大ブロック数(LRU 上限)。超過分は最古から退避します。
  maxBlocks: number;
};

export type ServerSideRowCache<T> = {
  // viewIndex の行を返します(未ロードは undefined)。recency は変更しません(純読み)。
  getRow: (viewIndex: number) => T | undefined;
  // ブロックがロード済みかを返します。
  hasBlock: (blockIndex: number) => boolean;
  // ブロックの行配列を格納します(MRU 化)。maxBlocks 超過時は最古を退避します。
  setBlock: (blockIndex: number, rows: T[]) => void;
  // 指定ブロックを MRU(最新)へ更新します(可視帯の保護用・effect から呼びます)。
  touchBlocks: (blockIndexes: number[]) => void;
  // 全ブロックを破棄します(rows / dataSource 切替時など)。
  clear: () => void;
  // ロード済みブロック index の配列(LRU 昇順 = 最古→最新)。主にテスト用です。
  loadedBlockIndexes: () => number[];
};

export function createServerSideRowCache<T>(
  options: ServerSideRowCacheOptions,
): ServerSideRowCache<T> {
  const blockSize = options.blockSize;
  const maxBlocks = options.maxBlocks;
  // blockIndex -> その範囲の行配列。Map の挿入順を LRU 順として使います。
  const blocks = new Map<number, T[]>();

  // 指定ブロックを末尾(最新)へ移します。存在しなければ何もしません。
  const moveToNewest = (blockIndex: number): void => {
    const rows = blocks.get(blockIndex);
    if (rows === undefined) {
      return;
    }
    blocks.delete(blockIndex);
    blocks.set(blockIndex, rows);
  };

  // maxBlocks 超過分を最古(先頭)から退避します。
  const evictIfNeeded = (): void => {
    while (blocks.size > maxBlocks) {
      const oldest = blocks.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      blocks.delete(oldest);
    }
  };

  const getRow = (viewIndex: number): T | undefined => {
    if (blockSize <= 0 || viewIndex < 0) {
      return undefined;
    }
    const blockIndex = Math.floor(viewIndex / blockSize);
    const rows = blocks.get(blockIndex);
    if (rows === undefined) {
      return undefined;
    }
    // ブロック内オフセット。末端の部分ブロックでは範囲外 → undefined になります。
    const offset = viewIndex - blockIndex * blockSize;
    return rows[offset];
  };

  const hasBlock = (blockIndex: number): boolean => blocks.has(blockIndex);

  const setBlock = (blockIndex: number, rows: T[]): void => {
    // 既存を消してから入れ直すことで、更新でも MRU(末尾)へ寄せます。
    if (blocks.has(blockIndex)) {
      blocks.delete(blockIndex);
    }
    blocks.set(blockIndex, rows);
    evictIfNeeded();
  };

  const touchBlocks = (blockIndexes: number[]): void => {
    for (const blockIndex of blockIndexes) {
      moveToNewest(blockIndex);
    }
  };

  const clear = (): void => {
    blocks.clear();
  };

  const loadedBlockIndexes = (): number[] => Array.from(blocks.keys());

  return {
    getRow,
    hasBlock,
    setBlock,
    touchBlocks,
    clear,
    loadedBlockIndexes,
  };
}
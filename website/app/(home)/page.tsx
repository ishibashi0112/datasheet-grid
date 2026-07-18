import Link from 'next/link';
import { BasicGridDemo } from '@/components/demo/basic-grid-demo';

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center flex-1 px-4 py-12">
      <div className="mx-auto w-full max-w-3xl text-center">
        <h1 className="text-2xl font-bold mb-4">SpreadsheetGrid</h1>
        <p className="mb-8">
          React 19 製の仮想化データグリッド。
          <Link href="/docs" className="font-medium underline">
            ドキュメント
          </Link>
          はこちら。
        </p>
        <div className="text-left">
          <BasicGridDemo />
        </div>
      </div>
    </div>
  );
}

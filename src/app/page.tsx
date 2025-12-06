export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>News Sender</h1>
      <p>技術記事配信サービス</p>
      <hr style={{ margin: '1rem 0' }} />
      <h2>使い方</h2>
      <ol>
        <li>Discordで <code>/register</code> を実行してユーザー登録</li>
        <li><code>/theme add [テーマ名]</code> で興味のあるテーマを追加</li>
        <li>毎朝9時におすすめ記事がDMで届きます</li>
      </ol>
      <h2>コマンド一覧</h2>
      <ul>
        <li><code>/register</code> - ユーザー登録</li>
        <li><code>/theme add [name]</code> - テーマ追加</li>
        <li><code>/theme list</code> - テーマ一覧</li>
        <li><code>/theme remove [name]</code> - テーマ削除</li>
        <li><code>/settings count [number]</code> - 配信件数設定</li>
        <li><code>/settings toggle</code> - 配信ON/OFF</li>
        <li><code>/settings status</code> - 設定確認</li>
      </ul>
    </main>
  );
}

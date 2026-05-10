export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>BizSync Agent Admin</h1>
      <p style={{ marginTop: 0, marginBottom: 16 }}>
        Upload files, run AI search, and manage companies/users.
      </p>
      <section style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>System Status</h2>
        <ul>
          <li>API: Ready</li>
          <li>OCR Queue: Ready</li>
          <li>Embedding Queue: Ready</li>
        </ul>
      </section>
    </main>
  );
}

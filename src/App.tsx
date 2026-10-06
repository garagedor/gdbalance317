const NEW_APP_URL = "https://the-convert.vercel.app";

const App = () => (
  <main className="min-h-screen w-full flex items-center justify-center bg-background text-foreground p-6">
    <div className="max-w-xl text-center space-y-6">
      <h1 className="text-3xl sm:text-4xl font-bold">The Weekly Balance app has moved</h1>
      <p className="text-lg text-muted-foreground">
        Please use the new app at{" "}
        <a href={NEW_APP_URL} className="underline text-primary">{NEW_APP_URL}</a>{" "}
        — log in with the same phone number and PIN (office/admin: same email and password).
      </p>
      <a
        href={NEW_APP_URL}
        className="inline-block rounded-xl bg-primary text-primary-foreground px-8 py-4 text-xl font-semibold shadow-lg hover:opacity-90"
      >
        Open the new app
      </a>
    </div>
  </main>
);

export default App;

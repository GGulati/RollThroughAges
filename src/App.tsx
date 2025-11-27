import './index.css';

function App() {
  return (
    <main className="app-shell">
      <section className="app-panel">
        <h1>Roll Through the Ages Planner</h1>
        <p>
          React + Redux client starter. You can extend this shell into the
          local-only experience with either pass-and-play or a solo bot.
        </p>
        <ul>
          <li>Phase controls and dice pools will live here.</li>
          <li>Use Redux slices for players, goods, and monuments.</li>
          <li>Add bot heuristics via thunks for solo play.</li>
        </ul>
      </section>
    </main>
  );
}

export default App;


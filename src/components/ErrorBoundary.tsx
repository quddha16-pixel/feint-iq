import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main>
        <section className="panel">
          <p className="eyebrow">WORKSPACE RECOVERY</p>
          <h1>The workspace could not be displayed.</h1>
          <p>
            Your browser data has not been cleared. Reload the application to
            try again, or export your library in Settings if the problem
            continues.
          </p>
          <button className="button" onClick={() => location.reload()}>
            Reload workspace
          </button>
        </section>
      </main>
    ) : (
      this.props.children
    );
  }
}

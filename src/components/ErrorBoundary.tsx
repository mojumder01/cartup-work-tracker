import { Component, type ReactNode } from 'react';
import { ErrorState } from './ui';

interface Props {
  children: ReactNode;
  /** Changing this key resets the boundary (e.g. on navigation). */
  resetKey?: string;
  title?: string;
}

/** Keeps one broken section from blanking the whole dashboard. No stack traces are shown to users. */
export class ErrorBoundary extends Component<Props, { failed: boolean; key?: string }> {
  state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: { failed: boolean; key?: string }) {
    if (props.resetKey !== state.key) return { failed: false, key: props.resetKey };
    return null;
  }

  componentDidCatch(error: unknown) {
    console.error('Dashboard section failed to render', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <ErrorState
          title={this.props.title ?? 'This section could not be displayed'}
          message="The data may have an unexpected format. Other sections are unaffected. Try refreshing the page."
        />
      );
    }
    return this.props.children;
  }
}

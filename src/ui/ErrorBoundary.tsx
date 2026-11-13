/**
 * Fängt Fehler beim Zeichnen der Oberfläche ab: statt einer leeren Seite erscheint eine
 * verständliche Meldung. Ungespeicherte Änderungen werden sofort in die
 * Wiederherstellungsdatei geschrieben; „Weiterarbeiten“ versucht die Ansicht neu aufzubauen.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { translate } from '../i18n';
import { emergencySave } from './autosaveSnapshot';
import { useSettings } from './state/settingsStore';

interface Props {
  children: ReactNode;
  /** Spieleransicht: keine Notsicherung (sie hält keine eigenen Daten). */
  saveOnError?: boolean;
}

interface State {
  error: Error | null;
  saved: boolean | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, saved: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, saved: null };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Fehler in der Oberfläche', error, info.componentStack);
    if (this.props.saveOnError === false) return;
    void emergencySave().then((saved) => this.setState({ saved }));
  }

  override render(): ReactNode {
    const { error, saved } = this.state;
    if (!error) return this.props.children;
    const t = (key: Parameters<typeof translate>[1]) =>
      translate(useSettings.getState().locale, key);
    return (
      <section className="page error-page" role="alert">
        <h1>{t('crash.heading')}</h1>
        <p>{t('crash.text')}</p>
        {saved === true && <p>{t('crash.saved')}</p>}
        {saved === false && this.props.saveOnError !== false && (
          <p className="muted">{t('crash.nothingToSave')}</p>
        )}
        <details>
          <summary>{t('crash.details')}</summary>
          <pre className="error-details">{`${error.name}: ${error.message}\n${error.stack ?? ''}`}</pre>
        </details>
        <div className="field-inline">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => this.setState({ error: null, saved: null })}
          >
            {t('crash.retry')}
          </button>
          <button type="button" className="btn" onClick={() => location.reload()}>
            {t('crash.reload')}
          </button>
        </div>
      </section>
    );
  }
}

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to an error reporting service
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    
    // Update state with error details
    this.setState({
      error: error || null,
      errorInfo: errorInfo || null
    });
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error ? String(this.state.error) : 'Bilinmeyen hata';
      const stack = this.state.errorInfo && this.state.errorInfo.componentStack
        ? this.state.errorInfo.componentStack
        : '';

      // Render fallback UI
      return (
        <div style={{
          padding: '20px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '5px',
          margin: '20px'
        }}>
          <h2>Bir hata oluştu</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {message}
            {stack ? (<><br />{stack}</>) : null}
          </details>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null, errorInfo: null });
            }}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Devam Et
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
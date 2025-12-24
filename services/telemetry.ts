
/**
 * JamTalk Telemetry Service
 * Professional-grade anonymized data collection.
 */

export interface TelemetryEvent {
  type: 'query' | 'lesson_complete' | 'feedback' | 'error' | 'performance' | 'pronunciation_score';
  payload: any;
  timestamp: number;
}

class TelemetryService {
  private isEnabled: boolean = false;
  // REPLACE THIS with your own logging endpoint (e.g., a Vercel Serverless Function or Baserow/Supabase URL)
  private readonly LOGGING_ENDPOINT = ''; 

  constructor() {
    this.isEnabled = this.getEnablement();
  }

  setEnablement(enabled: boolean) {
    this.isEnabled = enabled;
    localStorage.setItem('jamtalk_telemetry_enabled', JSON.stringify(enabled));
  }

  getEnablement(): boolean {
    const saved = localStorage.getItem('jamtalk_telemetry_enabled');
    // Default to false for strict privacy compliance, or true if you want data from the start
    return saved ? JSON.parse(saved) : true; 
  }

  /**
   * Logs an event to the developer.
   * If LOGGING_ENDPOINT is empty, it logs to the developer console for debugging.
   */
  async logEvent(event: TelemetryEvent) {
    if (!this.isEnabled) return;

    // 1. Sanitize payload (Remove PII - Personally Identifiable Information)
    const sanitizedPayload = this.sanitize(event.payload);

    // 2. Local Debugging Output
    console.groupCollapsed(`%c JamTalk Analytics: ${event.type} `, 'background: #052e16; color: #4ade80; font-weight: bold;');
    console.log('Timestamp:', new Date(event.timestamp).toLocaleString());
    console.log('Data:', sanitizedPayload);
    console.groupEnd();

    // 3. Remote Production Output
    if (this.LOGGING_ENDPOINT) {
      try {
        await fetch(this.LOGGING_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...event,
            payload: sanitizedPayload,
            appVersion: '1.0.0-prod',
            url: window.location.hostname
          }),
        });
      } catch (e) {
        // Silent fail in production to not disrupt user experience
      }
    }
  }

  private sanitize(payload: any): any {
    const sensitiveKeys = ['email', 'name', 'id', 'avatar', 'password', 'pin', 'token'];
    const clean = Array.isArray(payload) ? [...payload] : { ...payload };
    
    if (typeof clean === 'object' && clean !== null) {
      Object.keys(clean).forEach(key => {
        if (sensitiveKeys.includes(key.toLowerCase())) {
          clean[key] = '[REDACTED]';
        } else if (typeof clean[key] === 'object') {
          clean[key] = this.sanitize(clean[key]);
        }
      });
    }
    return clean;
  }
}

export const telemetry = new TelemetryService();

/**
 * Calendar Sync Service
 *
 * Handles bidirectional synchronization between OneAgenda and external calendar providers
 * (Google Calendar, Microsoft Calendar, iCal)
 */

import {
  type CalendarEvent,
  type Attendee,
  EventStatus,
  EventType,
  EventSource,
} from '../core-domain/calendar-event';

export type CalendarProvider = 'google' | 'microsoft' | 'ical';

type ResponseStatus = 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'NEEDS_ACTION';

/**
 * Maps external response status to OneAgenda response status
 */
function mapResponseStatus(status: string | undefined): ResponseStatus | undefined {
  if (!status) return undefined;
  const upper = status.toUpperCase();
  if (upper === 'ACCEPTED' || upper === 'YES') return 'ACCEPTED';
  if (upper === 'DECLINED' || upper === 'NO') return 'DECLINED';
  if (upper === 'TENTATIVE' || upper === 'MAYBE') return 'TENTATIVE';
  if (upper === 'NEEDS_ACTION' || upper === 'NONE' || upper === 'NOT_RESPONDED')
    return 'NEEDS_ACTION';
  return undefined;
}

/**
 * External calendar event types
 */
interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  hangoutLink?: string;
  reminders?: { overrides?: Array<{ method: string; minutes?: number }> };
  created?: string;
  updated?: string;
  organizer?: { email?: string };
}

interface MicrosoftCalendarEvent {
  id: string;
  subject?: string;
  body?: { content?: string; contentType?: string };
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  location?: { displayName?: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  isOrganizer?: boolean;
  attendees?: Array<{
    emailAddress: { address: string; name?: string };
    status?: { response?: string };
  }>;
  onlineMeeting?: { joinUrl?: string };
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  organizer?: { emailAddress?: { address?: string } };
}

interface ICalEvent {
  uid?: string;
  summary?: string;
  description?: string;
  start?: string;
  end?: string;
  location?: string;
}

type ExternalCalendarEvent = GoogleCalendarEvent | MicrosoftCalendarEvent | ICalEvent;

export interface CalendarProviderConfig {
  provider: CalendarProvider;
  userId: string;
  accessToken?: string;
  refreshToken?: string;
  calendarUrl?: string; // For iCal
  syncEnabled: boolean;
  lastSyncAt?: Date;
}

export interface SyncResult {
  provider: CalendarProvider;
  success: boolean;
  eventsImported: number;
  eventsExported: number;
  errors: string[];
  syncedAt: Date;
}

export interface CalendarEventTransform {
  fromExternal(externalEvent: ExternalCalendarEvent, provider: CalendarProvider): CalendarEvent;
  toExternal(event: CalendarEvent, provider: CalendarProvider): ExternalCalendarEvent;
}

/**
 * Calendar Sync Service
 *
 * Orchestrates synchronization between OneAgenda and external calendar providers.
 * Supports Google Calendar, Microsoft Calendar, and iCal (CalDAV) providers.
 */
export class CalendarSyncService {
  private providers: Map<string, CalendarProviderConfig> = new Map();

  /**
   * Register a calendar provider for a user
   */
  registerProvider(config: CalendarProviderConfig): void {
    const key = `${config.userId}:${config.provider}`;
    this.providers.set(key, config);
  }

  /**
   * Remove a calendar provider for a user
   */
  removeProvider(userId: string, provider: CalendarProvider): void {
    const key = `${userId}:${provider}`;
    this.providers.delete(key);
  }

  /**
   * Get all providers for a user
   */
  getUserProviders(userId: string): CalendarProviderConfig[] {
    return Array.from(this.providers.values()).filter(
      (p: CalendarProviderConfig) => p.userId === userId
    );
  }

  /**
   * Sync events from external calendar to OneAgenda
   */
  async syncFromExternal(
    userId: string,
    provider: CalendarProvider,
    startDate: Date,
    endDate: Date
  ): Promise<CalendarEvent[]> {
    const key = `${userId}:${provider}`;
    const config = this.providers.get(key);

    if (!config || !config.syncEnabled) {
      throw new Error(`Provider ${provider} not configured for user ${userId}`);
    }

    const externalEvents = await this.fetchExternalEvents(config, startDate, endDate);

    const transformer = this.getTransformer();
    return externalEvents.map((e: ExternalCalendarEvent) => transformer.fromExternal(e, provider));
  }

  /**
   * Sync events from OneAgenda to external calendar
   */
  async syncToExternal(
    userId: string,
    provider: CalendarProvider,
    events: CalendarEvent[]
  ): Promise<void> {
    const key = `${userId}:${provider}`;
    const config = this.providers.get(key);

    if (!config || !config.syncEnabled) {
      throw new Error(`Provider ${provider} not configured for user ${userId}`);
    }

    const transformer = this.getTransformer();
    const externalEvents = events.map((e: CalendarEvent) => transformer.toExternal(e, provider));

    await this.pushExternalEvents(config, externalEvents);
  }

  /**
   * Perform bidirectional sync
   */
  async bidirectionalSync(
    userId: string,
    provider: CalendarProvider,
    localEvents: CalendarEvent[],
    startDate: Date,
    endDate: Date
  ): Promise<SyncResult> {
    const result: SyncResult = {
      provider,
      success: false,
      eventsImported: 0,
      eventsExported: 0,
      errors: [],
      syncedAt: new Date(),
    };

    try {
      // Fetch external events
      const externalEvents = await this.syncFromExternal(userId, provider, startDate, endDate);
      result.eventsImported = externalEvents.length;

      // Push local events that need to be synced
      // Convert provider to EventSource for comparison
      const providerEventSource: EventSource =
        provider === 'google'
          ? EventSource.GOOGLE
          : provider === 'microsoft'
            ? EventSource.MICROSOFT
            : provider === 'ical'
              ? EventSource.ICAL
              : EventSource.OTHER;
      const eventsToExport = localEvents.filter(
        (e: CalendarEvent) => e.source !== providerEventSource && !e.externalId
      );
      if (eventsToExport.length > 0) {
        await this.syncToExternal(userId, provider, eventsToExport);
        result.eventsExported = eventsToExport.length;
      }

      result.success = true;
    } catch (error: unknown) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Fetch events from external calendar
   */
  private async fetchExternalEvents(
    config: CalendarProviderConfig,
    startDate: Date,
    endDate: Date
  ): Promise<ExternalCalendarEvent[]> {
    switch (config.provider) {
      case 'google':
        return this.fetchGoogleEvents(config, startDate, endDate);
      case 'microsoft':
        return this.fetchMicrosoftEvents(config, startDate, endDate);
      case 'ical':
        return this.fetchICalEvents(config, startDate, endDate);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  /**
   * Push events to external calendar
   */
  private async pushExternalEvents(
    config: CalendarProviderConfig,
    events: ExternalCalendarEvent[]
  ): Promise<void> {
    switch (config.provider) {
      case 'google':
        await this.pushGoogleEvents(config, events as GoogleCalendarEvent[]);
        break;
      case 'microsoft':
        await this.pushMicrosoftEvents(config, events as MicrosoftCalendarEvent[]);
        break;
      case 'ical':
        // iCal is typically read-only
        throw new Error('iCal provider does not support push');
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  /**
   * Google Calendar integration
   */
  private async fetchGoogleEvents(
    config: CalendarProviderConfig,
    startDate: Date,
    endDate: Date
  ): Promise<GoogleCalendarEvent[]> {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        new URLSearchParams({
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
        }),
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Google Calendar API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  private async pushGoogleEvents(
    config: CalendarProviderConfig,
    events: GoogleCalendarEvent[]
  ): Promise<void> {
    for (const event of events) {
      await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });
    }
  }

  /**
   * Microsoft Calendar integration
   */
  private async fetchMicrosoftEvents(
    config: CalendarProviderConfig,
    startDate: Date,
    endDate: Date
  ): Promise<MicrosoftCalendarEvent[]> {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendar/events?` +
        new URLSearchParams({
          startDateTime: startDate.toISOString(),
          endDateTime: endDate.toISOString(),
          $orderby: 'start/dateTime',
        }),
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Microsoft Graph API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  }

  private async pushMicrosoftEvents(
    config: CalendarProviderConfig,
    events: MicrosoftCalendarEvent[]
  ): Promise<void> {
    for (const event of events) {
      await fetch('https://graph.microsoft.com/v1.0/me/calendar/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });
    }
  }

  /**
   * iCal (CalDAV) integration
   */
  private async fetchICalEvents(
    config: CalendarProviderConfig,
    _startDate: Date,
    _endDate: Date
  ): Promise<ICalEvent[]> {
    if (!config.calendarUrl) {
      throw new Error('iCal calendar URL not configured');
    }

    const response = await fetch(config.calendarUrl);

    if (!response.ok) {
      throw new Error(`iCal fetch error: ${response.statusText}`);
    }

    const icalData = await response.text();
    return this.parseICalData(icalData);
  }

  /**
   * Parse iCal data (basic implementation)
   */
  private parseICalData(icalData: string): ICalEvent[] {
    const events: ICalEvent[] = [];
    const lines = icalData.split('\n');
    let currentEvent: ICalEvent | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === 'BEGIN:VEVENT') {
        currentEvent = {} as ICalEvent;
      } else if (trimmed === 'END:VEVENT' && currentEvent) {
        events.push(currentEvent);
        currentEvent = null;
      } else if (currentEvent) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':');

        if (key === 'SUMMARY') {
          currentEvent.summary = value;
        } else if (key === 'DTSTART') {
          currentEvent.start = value;
        } else if (key === 'DTEND') {
          currentEvent.end = value;
        } else if (key === 'DESCRIPTION') {
          currentEvent.description = value;
        } else if (key === 'LOCATION') {
          currentEvent.location = value;
        } else if (key === 'UID') {
          currentEvent.uid = value;
        }
      }
    }

    return events;
  }

  /**
   * Get event transformer
   */
  private getTransformer(): CalendarEventTransform {
    return {
      fromExternal: (
        externalEvent: ExternalCalendarEvent,
        provider: CalendarProvider
      ): CalendarEvent => {
        switch (provider) {
          case 'google':
            return this.transformGoogleEvent(externalEvent as GoogleCalendarEvent);
          case 'microsoft':
            return this.transformMicrosoftEvent(externalEvent as MicrosoftCalendarEvent);
          case 'ical':
            return this.transformICalEvent(externalEvent as ICalEvent);
          default:
            throw new Error(`Unsupported provider: ${provider}`);
        }
      },
      toExternal: (event: CalendarEvent, provider: CalendarProvider): ExternalCalendarEvent => {
        switch (provider) {
          case 'google':
            return this.transformToGoogleEvent(event) as ExternalCalendarEvent;
          case 'microsoft':
            return this.transformToMicrosoftEvent(event) as ExternalCalendarEvent;
          default:
            throw new Error(`Unsupported provider: ${provider}`);
        }
      },
    };
  }

  /**
   * Transform Google Calendar event to OneAgenda event
   */
  private transformGoogleEvent(googleEvent: GoogleCalendarEvent): CalendarEvent {
    return {
      id: googleEvent.id,
      title: googleEvent.summary || 'Untitled Event',
      description: googleEvent.description,
      startTime: new Date(
        googleEvent.start.dateTime || googleEvent.start.date || new Date().toISOString()
      ).toISOString(),
      endTime: new Date(
        googleEvent.end.dateTime || googleEvent.end.date || new Date().toISOString()
      ).toISOString(),
      location: googleEvent.location,
      allDay: !googleEvent.start.dateTime,
      timezone: googleEvent.start.timeZone || 'UTC',
      status:
        googleEvent.status === 'confirmed'
          ? EventStatus.CONFIRMED
          : googleEvent.status === 'tentative'
            ? EventStatus.TENTATIVE
            : EventStatus.CANCELLED,
      type: EventType.MEETING,
      source: EventSource.GOOGLE,
      externalId: googleEvent.id,
      attendees: (googleEvent.attendees || []).map((attendee) => ({
        email: attendee.email,
        name: attendee.displayName,
        responseStatus: mapResponseStatus(attendee.responseStatus),
        optional: false,
      })),
      meetingUrl: googleEvent.hangoutLink,
      reminders: (googleEvent.reminders?.overrides || []).map(
        (r: { method: string; minutes?: number }) => ({
          method: r.method === 'email' ? 'EMAIL' : r.method === 'popup' ? 'POPUP' : 'SMS',
          minutesBefore: r.minutes || 0,
        })
      ),
      flexibility: 'FIXED',
      priority: 5,
      context: {},
      createdAt: new Date(googleEvent.created || new Date().toISOString()).toISOString(),
      updatedAt: new Date(googleEvent.updated || new Date().toISOString()).toISOString(),
      createdBy: googleEvent.organizer?.email || '',
    };
  }

  /**
   * Transform Microsoft Calendar event to OneAgenda event
   */
  private transformMicrosoftEvent(msEvent: MicrosoftCalendarEvent): CalendarEvent {
    return {
      id: msEvent.id,
      title: msEvent.subject || 'Untitled Event',
      description: msEvent.body?.content,
      startTime: new Date(msEvent.start.dateTime).toISOString(),
      endTime: new Date(msEvent.end.dateTime).toISOString(),
      location: msEvent.location?.displayName,
      allDay: msEvent.isAllDay || false,
      timezone: msEvent.start.timeZone || 'UTC',
      status: msEvent.isCancelled
        ? EventStatus.CANCELLED
        : msEvent.isOrganizer
          ? EventStatus.CONFIRMED
          : EventStatus.TENTATIVE,
      type: EventType.MEETING,
      source: EventSource.MICROSOFT,
      externalId: msEvent.id,
      attendees: (msEvent.attendees || []).map((attendee) => ({
        email: attendee.emailAddress.address,
        name: attendee.emailAddress.name,
        responseStatus: mapResponseStatus(attendee.status?.response),
        optional: false,
      })),
      meetingUrl: msEvent.onlineMeeting?.joinUrl,
      reminders: [],
      flexibility: 'FIXED',
      priority: 5,
      context: {},
      createdAt: new Date(msEvent.createdDateTime || new Date().toISOString()).toISOString(),
      updatedAt: new Date(msEvent.lastModifiedDateTime || new Date().toISOString()).toISOString(),
      createdBy: msEvent.organizer?.emailAddress?.address || '',
    };
  }

  /**
   * Transform iCal event to OneAgenda event
   */
  private transformICalEvent(icalEvent: ICalEvent): CalendarEvent {
    return {
      id: icalEvent.uid || crypto.randomUUID(),
      title: icalEvent.summary || 'Untitled Event',
      description: icalEvent.description,
      startTime: this.parseICalDate(icalEvent.start).toISOString(),
      endTime: this.parseICalDate(icalEvent.end).toISOString(),
      location: icalEvent.location,
      allDay: icalEvent.start?.length === 8, // YYYYMMDD format
      timezone: 'UTC',
      status: EventStatus.CONFIRMED,
      type: EventType.OTHER,
      source: EventSource.ICAL,
      externalId: icalEvent.uid,
      attendees: [],
      reminders: [],
      flexibility: 'FIXED',
      priority: 5,
      context: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: '',
    };
  }

  /**
   * Transform OneAgenda event to Google Calendar event
   */
  private transformToGoogleEvent(event: CalendarEvent): GoogleCalendarEvent {
    return {
      id: event.externalId || event.id,
      summary: event.title,
      description: event.description,
      location: event.location,
      start: event.allDay
        ? { date: event.startTime.split('T')[0] }
        : { dateTime: event.startTime, timeZone: event.timezone },
      end: event.allDay
        ? { date: event.endTime.split('T')[0] }
        : { dateTime: event.endTime, timeZone: event.timezone },
      attendees: event.attendees?.map((a: Attendee) => ({
        email: a.email,
        displayName: a.name,
        responseStatus: a.responseStatus?.toLowerCase(),
      })),
    };
  }

  /**
   * Transform OneAgenda event to Microsoft Calendar event
   */
  private transformToMicrosoftEvent(event: CalendarEvent): MicrosoftCalendarEvent {
    return {
      id: event.externalId || event.id,
      subject: event.title,
      body: {
        contentType: 'HTML',
        content: event.description || '',
      },
      start: {
        dateTime: event.startTime,
        timeZone: event.timezone,
      },
      end: {
        dateTime: event.endTime,
        timeZone: event.timezone,
      },
      location: {
        displayName: event.location || '',
      },
      isAllDay: event.allDay,
      attendees: event.attendees?.map((a: Attendee) => ({
        emailAddress: {
          address: a.email,
          name: a.name,
        },
        status: { response: a.responseStatus?.toLowerCase() || 'none' },
      })),
    };
  }

  /**
   * Parse iCal date format
   */
  private parseICalDate(dateStr?: string): Date {
    if (!dateStr) {
      return new Date();
    }

    // Handle YYYYMMDD format
    if (dateStr.length === 8) {
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      return new Date(year, month, day);
    }

    // Handle YYYYMMDDTHHmmss format
    if (dateStr.length === 15) {
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      const hour = parseInt(dateStr.substring(9, 11));
      const minute = parseInt(dateStr.substring(11, 13));
      const second = parseInt(dateStr.substring(13, 15));
      return new Date(year, month, day, hour, minute, second);
    }

    return new Date(dateStr);
  }
}

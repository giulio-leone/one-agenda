#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import ical, { type VEvent } from 'node-ical';
import { formatISO } from 'date-fns';
import { v4 as uuid } from 'uuid';
import { OneAgendaAgenticPlanner } from '../agentic/agentic-planner';
import { PlannerInputSchema, WhatIfScenarioSchema } from '../domain/types';
import { demoPlannerInput } from '../demo/demo-data';

const planner = new OneAgendaAgenticPlanner();

const program = new Command();

program.name('oneagenda').description('Strumenti CLI per OneAgenda').version('1.0.0');

program
  .command('replan')
  .description('Ricalcola il piano per una data specifica')
  .option('-d, --date <date>', 'Data in formato ISO', formatISO(new Date()))
  .option('-i, --input <path>', 'File JSON di input')
  .action(async (options) => {
    const input = options.input
      ? PlannerInputSchema.parse(JSON.parse(readFileSync(options.input, 'utf-8')))
      : demoPlannerInput(options.date);
    const normalized = { ...input, date: options.date ?? input.date };
    const plan = await planner.generatePlan(normalized);
    process.stdout.write(JSON.stringify(plan, null, 2));
  });

program
  .command('what-if')
  .description('Simula uno scenario what-if')
  .requiredOption('-s, --scenario <json>', 'Scenario in JSON')
  .option('-i, --input <path>', 'File JSON di input')
  .action(async (options) => {
    const input = options.input
      ? PlannerInputSchema.parse(JSON.parse(readFileSync(options.input, 'utf-8')))
      : demoPlannerInput();
    const baseline = await planner.generatePlan(input);
    const scenario = WhatIfScenarioSchema.parse(JSON.parse(options.scenario));
    const result = await planner.simulateScenario(input, baseline, scenario);
    process.stdout.write(JSON.stringify(result, null, 2));
  });

program
  .command('import-ics')
  .description('Importa un file ICS e produce eventi OneAgenda')
  .requiredOption('-f, --file <path>', 'Percorso del file .ics')
  .option('-o, --output <path>', 'Percorso del file JSON di output')
  .action((options) => {
    const events = ical.sync.parseFile(options.file) as Record<string, VEvent | unknown>;
    type ICalAttendee = string | { val?: string; params?: Record<string, string> };
    const parsed = Object.values(events)
      .filter(
        (item): item is VEvent =>
          typeof item === 'object' && item !== null && (item as VEvent).type === 'VEVENT'
      )
      .map((event) => {
        const attendeesRaw: ICalAttendee[] = Array.isArray(event.attendee)
          ? (event.attendee as ICalAttendee[])
          : event.attendee
            ? ([event.attendee] as ICalAttendee[])
            : [];

        const attendees = attendeesRaw.map((attendee) =>
          typeof attendee === 'string'
            ? { id: attendee, name: attendee }
            : {
                id: attendee.val ?? uuid(),
                name: attendee.params?.CN ?? attendee.val ?? 'Partecipante',
              }
        );

        return {
          id: uuid(),
          title: event.summary ?? 'Evento',
          start: formatISO(event.start ?? new Date()),
          end: formatISO(event.end ?? event.start ?? new Date()),
          source: 'EXTERNAL',
          meeting: {
            attendees,
            meetingLink: typeof event.url === 'string' ? event.url : null,
          },
          category: 'MEETING',
          flexibility: 'FIXED',
          createdFrom: 'CALENDAR',
        };
      });

    if (options.output) {
      writeFileSync(options.output, JSON.stringify(parsed, null, 2));
      process.stdout.write(`✅ Eventi salvati in ${options.output}\n`);
    } else {
      process.stdout.write(JSON.stringify(parsed, null, 2));
    }
  });

program.parseAsync(process.argv);

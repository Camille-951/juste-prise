import { Component, effect, HostListener, signal, untracked } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { NativeDateAdapter, provideNativeDateAdapter, MAT_DATE_LOCALE, DateAdapter } from '@angular/material/core';
import { PercentPipe } from '@angular/common';

/** Forces the calendar week to start on Monday instead of the default Sunday. */
class MondayFirstDateAdapter extends NativeDateAdapter {
  override getFirstDayOfWeek(): number { return 1; }
}

/** Whether a given day is an active treatment day or a pause day. */
type DayStatus = 'prise' | 'pause'; // | 'weekend';

interface CalendarDay {
  date: Date;
  status: DayStatus;
  isNewMonth: boolean;
}

interface CalendarMonth {
  label: string;
  days: CalendarDay[];
  firstOffset: number; // 0=Mon, 6=Sun — used to offset the first day in the CSS grid
}

interface PosologieData {
  doseNumber: number | null;
  doseLines: DoseLine[];
  rythm: Rythme;
  dates: {
    dispensation: Date | null;
    retour: Date | null;
    debutCycle: Date | null;
  }
}

/** One dosage strength with its dispensed/returned pill counts. */
interface DoseLine {
  id : number;
  dosePerUnit: number | null;  // mg per unit (tablet, capsule…)
  unitPerDay: number | null;   // number of units the patient should take each treatment day
  dispensed: number | null;    // units given to the patient at dispensation
  returned: number | null;     // units brought back by the patient at return visit
}

/**
 * One treatment/pause block within a discontinuous rhythm.
 * Sequences are applied in order and the full set repeats cyclically.
 */
interface Sequence {
  id: number;
  traitement: number | null; // treatment days in this block
  pause: number | null;      // pause days following the treatment block
}

interface Rythme {
  mode: 'continu' | 'discontinu';
  sequences: Sequence[]; // max 5 sequences; only used when mode === 'discontinu'
  // weekEnd: boolean;
}

@Component({
  selector: 'app-observance-form',
  imports: [FormField, MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatInputModule, PercentPipe],
  providers: [
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'fr-FR' },
    { provide: DateAdapter, useClass: MondayFirstDateAdapter },
  ],
  templateUrl: './observance-form.html',
  styleUrl: './observance-form.scss',
})
export class ObservanceForm {

  /** Single source of truth for the whole form; the reactive form proxy derives from it. */
  posologieModel = signal<PosologieData>({
    doseNumber: null,
    doseLines: [],
    rythm: {
      mode: 'continu',
      // weekEnd: false,
      sequences: [{ id: 1, traitement: null, pause: null }]
    },
    dates: {
      dispensation: null,
      retour: null,
      debutCycle: null
    }
  });

  posologieForm = form(this.posologieModel);

  constructor() {
    // Keep doseLines in sync with the doseNumber input (max 20 lines).
    // untracked() is used when reading doseLines to avoid a circular dependency.
    effect(() => {
      const rawTarget = Number(this.posologieForm.doseNumber().value() || 0);
      const targetNumber = Math.min(rawTarget, 20);
      const currentLines = untracked(() => this.posologieModel().doseLines);

      if(targetNumber < 0 || targetNumber === currentLines.length) {
        return;
      }

      let newLines = [...currentLines];

      if (targetNumber > currentLines.length) {
        const diff = targetNumber - currentLines.length;

              for (let i = 0; i < diff; i++) {
                newLines.push({
                  id: Date.now() + i,
                  dosePerUnit: null,
                  unitPerDay: null,
                  dispensed: null,
                  returned: null,
                });
              }
      }else if (targetNumber < currentLines.length) {
        newLines = currentLines.slice(0, targetNumber);
      }

      this.posologieModel.update(model => ({
        ...model,
        doseNumber: targetNumber,
        doseLines: newLines
      }));
    }, {allowSignalWrites: true});
  }


  /**
   * Given a day offset from the cycle reference date and the list of sequences,
   * returns whether that day falls in a treatment or pause phase.
   *
   * The sequences are played in order and the full set repeats indefinitely.
   * E.g. [5 on / 2 off, 3 on / 1 off] → total cycle = 11 days, then loops.
   */
  private getStatusInCycle(daysSinceCycleStart: number, sequences: Sequence[]): DayStatus {
    const totalCycleLength = sequences.reduce((sum, s) => sum + (s.traitement || 0) + (s.pause || 0), 0);
    if (totalCycleLength === 0) return 'prise';
    // Normalise to handle negative offsets (cycle start before dispensation date)
    const pos = ((daysSinceCycleStart % totalCycleLength) + totalCycleLength) % totalCycleLength;
    let offset = 0;
    for (const seq of sequences) {
      const t = seq.traitement || 0;
      const p = seq.pause || 0;
      if (pos < offset + t) return 'prise';
      offset += t;
      if (pos < offset + p) return 'pause';
      offset += p;
    }
    return 'prise';
  }

  /**
   * Counts the number of actual treatment days between start (inclusive) and end (exclusive),
   * taking the rhythm into account (continuous = every day; discontinuous = only treatment phases).
   */
  private countTreatmentDays(start: Date, end: Date, rythm: Rythme): number {
    let count = 0;

    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const end0 = new Date(end);
    end0.setHours(0, 0, 0, 0);

    let dayIndex = 0;

    while (current < end0) {
      if (rythm.mode === 'discontinu') {
        if (this.getStatusInCycle(dayIndex, rythm.sequences) !== 'prise') {
          current.setDate(current.getDate() + 1);
          dayIndex++;
          continue;
        }
      }

      count++;
      current.setDate(current.getDate() + 1);
      dayIndex++;
    }

    return count;
  }

  /**
   * Builds the list of calendar months to display, from the cycle start (or dispensation date)
   * to the return date. Each day is tagged with its treatment status.
   */
  getCalendarMonths(): CalendarMonth[] {
    const model = this.posologieModel();
    const { dispensation, retour, debutCycle } = model.dates;
    const rythm = model.rythm;

    if (!dispensation || !retour) return [];

    const days: CalendarDay[] = [];

    const start = debutCycle ?? dispensation;
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const end = new Date(retour);
    end.setHours(0, 0, 0, 0);

    let dayIndex = 0;
    let lastMonth = -1;

    while (current < end) {
      let status: DayStatus;

      if (rythm.mode === 'discontinu') {
        status = this.getStatusInCycle(dayIndex, rythm.sequences);
      } else {
        status = 'prise';
      }

      const currentMonth = current.getMonth();
      days.push({ date: new Date(current), status, isNewMonth: currentMonth !== lastMonth });
      lastMonth = currentMonth;
      current.setDate(current.getDate() + 1);
      dayIndex++;
    }

    // Group flat day list into per-month buckets
    const months: CalendarMonth[] = [];
    let currentMonthDays: CalendarDay[] = [];

    for (const day of days) {
      if (day.isNewMonth && currentMonthDays.length > 0) {
        months.push(this.buildCalendarMonth(currentMonthDays));
        currentMonthDays = [];
      }
      currentMonthDays.push(day);
    }
    if (currentMonthDays.length > 0) {
      months.push(this.buildCalendarMonth(currentMonthDays));
    }

    return months;
  }

  private buildCalendarMonth(days: CalendarDay[]): CalendarMonth {
    const firstDate = days[0].date;
    return {
      label: firstDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
      days,
      firstOffset: (firstDate.getDay() + 6) % 7, // Mon=0 … Sun=6
    };
  }

  /**
   * Computes the weighted global observance across all dose lines.
   *
   * Formula:
   *   Σ( dose_i × (dispensed_i − returned_i) )
   *   ─────────────────────────────────────────
   *   Σ( dose_i × unitPerDay_i × treatmentDays )
   *
   * A null or zero dosePerUnit is treated as 1 to avoid zeroing out the contribution.
   * Returns null if required data is missing or incomplete.
   */
  getGlobalObservance(): number | null {
    const model = this.posologieModel();
    const { dispensation, retour, debutCycle } = model.dates;
    const rythm = model.rythm;
    const lines = model.doseLines;

    if (!dispensation || !retour || lines.length === 0) return null;

    if (rythm.mode === 'discontinu' && !rythm.sequences.every(s => s.traitement !== null && s.pause !== null)) {
      return null;
    }

    const treatmentDays = this.countTreatmentDays(debutCycle ?? dispensation, retour, rythm);
    if (treatmentDays <= 0) return null;

    let numerator = 0;
    let denominator = 0;
    let hasValidLine = false;

    for (const line of lines) {
      if (line.dispensed === null || line.returned === null || !line.unitPerDay) continue;
      const dose = line.dosePerUnit || 1; // treat 0/null as 1 to preserve the line's weight
      numerator += dose * (line.dispensed - line.returned);
      denominator += dose * line.unitPerDay * treatmentDays;
      hasValidLine = true;
    }

    if (!hasValidLine || denominator === 0) return null;

    return numerator / denominator;
  }

  /** Returns the theoretical number of units the patient should have brought back. */
  getTheoreticalReturned(index: number): number | null {
    const model = this.posologieModel();
    const line = model.doseLines[index];
    const dates = model.dates;
    const rythm = model.rythm;

    if (!dates.dispensation || !dates.retour || line.dispensed === null || !line.unitPerDay) return null;

    if (rythm.mode === 'discontinu' && !rythm.sequences.every(s => s.traitement !== null && s.pause !== null)) return null;

    const treatmentDays = this.countTreatmentDays(dates.debutCycle ?? dates.dispensation, dates.retour, rythm);
    if (treatmentDays <= 0) return null;

    return line.dispensed - treatmentDays * line.unitPerDay;
  }

  /**
   * Computes observance for a single dose line.
   *
   * Formula: (dispensed − returned) / (unitPerDay × treatmentDays)
   * Returns null if required data is missing or incomplete.
   */
  getObservance(index: number): number | null {
    const model = this.posologieModel();
    const line = model.doseLines[index];
    const dates = model.dates;
    const rythm = model.rythm;

    if (!dates.dispensation || !dates.retour || line.dispensed === null || line.returned === null || !line.unitPerDay) {
      return null;
    }

    // All sequences must be fully filled in before we can compute
    if (rythm.mode === 'discontinu' && !rythm.sequences.every(s => s.traitement !== null && s.pause !== null)) {
      return null;
    }

    const treatmentDays = this.countTreatmentDays(dates.debutCycle ?? dates.dispensation, dates.retour, rythm);

    if (treatmentDays <= 0) return null;

    const theorique = treatmentDays * line.unitPerDay;
    const reelle = line.dispensed - line.returned;

    return reelle / theorique;
  }

  /** Appends a new empty sequence (up to the 5-sequence limit). */
  addSequence() {
    this.posologieModel.update(model => ({
      ...model,
      rythm: {
        ...model.rythm,
        sequences: [...model.rythm.sequences, { id: Date.now(), traitement: null, pause: null }]
      }
    }));
  }

  /** Removes the sequence at the given index. */
  removeSequence(index: number) {
    this.posologieModel.update(model => ({
      ...model,
      rythm: {
        ...model.rythm,
        sequences: model.rythm.sequences.filter((_, i) => i !== index)
      }
    }));
  }

  @HostListener('document:keydown.control.shift.d', ['$event'])
  onCtrlT(event: Event) {
    event.preventDefault();
    this.toggleTest();
  }

  toggleTest() {
    if (this.posologieModel().doseNumber !== null) {
      this.posologieModel.set({
        doseNumber: null,
        doseLines: [],
        rythm: { mode: 'continu', sequences: [{ id: 1, traitement: null, pause: null }] },
        dates: { dispensation: null, retour: null, debutCycle: null }
      });
      return;
    }

    this.posologieModel.set({
      doseNumber: 2,
      doseLines: [
        { id: 1, dosePerUnit: 75, unitPerDay: 1, dispensed: 21, returned: 0 },
        { id: 2, dosePerUnit: 50,  unitPerDay: 2, dispensed: 60, returned: 20 },
      ],
      rythm: { mode: 'discontinu', sequences: [{ id: 1, traitement: 21, pause: 7 }] },
      dates: {
        dispensation: new Date('2026-03-10'),
        retour:       new Date('2026-04-07'),
        debutCycle:   null
      }
    });
  }

}

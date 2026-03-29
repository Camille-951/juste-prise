import { Component, effect, signal, untracked } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { NativeDateAdapter, provideNativeDateAdapter, MAT_DATE_LOCALE, DateAdapter } from '@angular/material/core';
import { PercentPipe } from '@angular/common';

class MondayFirstDateAdapter extends NativeDateAdapter {
  override getFirstDayOfWeek(): number { return 1; }
}

type DayStatus = 'prise' | 'pause'; // | 'weekend';

interface CalendarDay {
  date: Date;
  status: DayStatus;
  isNewMonth: boolean;
}

interface CalendarMonth {
  label: string;
  days: CalendarDay[];
  firstOffset: number; // 0=lun, 6=dim
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

interface DoseLine {
  id : number;
  dosePerUnit: number | null;
  unitPerDay: number | null;
  dispensed: number | null;
  returned: number | null;
}

interface Rythme {
  mode: 'continu' | 'discontinu';
  traitement: number | null;
  pause: number | null;
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

   posologieModel = signal<PosologieData>({
    doseNumber: null,
    doseLines: [],
    rythm: {
      mode: 'continu',
      // weekEnd: false,
      traitement: null,
      pause: null
    },
    dates: {
      dispensation: null,
      retour: null,
      debutCycle: null
    }
  });

  posologieForm = form(this.posologieModel);

  constructor() {
    effect(() => {
      const rawTarget = Number(this.posologieForm.doseNumber().value() || 0);
      const targetNumber = Math.min(rawTarget, 20); // Nombre max de lignes
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


  private countTreatmentDays(start: Date, end: Date, rythm: Rythme): number {
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    let count = 0;

    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endNorm = new Date(end);
    endNorm.setHours(0, 0, 0, 0);

    const cycleRef = new Date(start);
    cycleRef.setHours(0, 0, 0, 0);

    while (current < endNorm) {
      // // Exclure les weekends si l'option est cochée
      // const dayOfWeek = current.getDay(); // 0 = dimanche, 6 = samedi
      // if (rythm.weekEnd && (dayOfWeek === 0 || dayOfWeek === 6)) {
      //   current.setDate(current.getDate() + 1);
      //   continue;
      // }

      // En mode discontinu, vérifier si le jour est dans une phase de traitement
      if (rythm.mode === 'discontinu' && rythm.traitement !== null && rythm.pause !== null) {
        const cycleLength = rythm.traitement + rythm.pause;
        const daysSinceCycleStart = Math.floor((current.getTime() - cycleRef.getTime()) / MS_PER_DAY);
        const positionInCycle = ((daysSinceCycleStart % cycleLength) + cycleLength) % cycleLength;

        if (positionInCycle >= rythm.traitement) {
          current.setDate(current.getDate() + 1);
          continue;
        }
      }

      count++;
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  getCalendarMonths(): CalendarMonth[] {
    const model = this.posologieModel();
    const { dispensation, retour, debutCycle } = model.dates;
    const rythm = model.rythm;

    if (!dispensation || !retour) return [];

    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const days: CalendarDay[] = [];

    const start = debutCycle ?? dispensation;
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const end = new Date(retour);
    end.setHours(0, 0, 0, 0);

    const cycleRef = new Date(start);
    cycleRef.setHours(0, 0, 0, 0);

    let lastMonth = -1;

    while (current < end) {
      // const dayOfWeek = current.getDay();
      // const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      let status: DayStatus;

      // if (rythm.weekEnd && isWeekend) {
      //   status = 'weekend';
      // } else
      if (rythm.mode === 'discontinu' && rythm.traitement !== null && rythm.pause !== null) {
        const cycleLength = rythm.traitement + rythm.pause;
        const daysSinceCycleStart = Math.floor((current.getTime() - cycleRef.getTime()) / MS_PER_DAY);
        const positionInCycle = ((daysSinceCycleStart % cycleLength) + cycleLength) % cycleLength;
        status = positionInCycle < rythm.traitement ? 'prise' : 'pause';
      } else {
        status = 'prise';
      }

      const currentMonth = current.getMonth();
      days.push({ date: new Date(current), status, isNewMonth: currentMonth !== lastMonth });
      lastMonth = currentMonth;
      current.setDate(current.getDate() + 1);
    }

    // Grouper par mois
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
      firstOffset: (firstDate.getDay() + 6) % 7, // lun=0, dim=6
    };
  }

  getObservance(index: number): number | null {
    const model = this.posologieModel();
    const line = model.doseLines[index];
    const dates = model.dates;
    const rythm = model.rythm;

    if (!dates.dispensation || !dates.retour || line.dispensed === null || line.returned === null || !line.unitPerDay) {
      return null;
    }

    // En mode discontinu, les jours de traitement et de pause sont requis
    if (rythm.mode === 'discontinu' && (rythm.traitement === null || rythm.pause === null)) {
      return null;
    }

    const treatmentDays = this.countTreatmentDays(dates.debutCycle ?? dates.dispensation, dates.retour, rythm);

    if (treatmentDays <= 0) return null;

    const theorique = treatmentDays * line.unitPerDay;
    const reelle = line.dispensed - line.returned;

    return reelle / theorique;
  }
  
}

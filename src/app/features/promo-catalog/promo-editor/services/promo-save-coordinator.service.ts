import { inject, Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, catchError, defer, EMPTY, exhaustMap, finalize, from, map, mergeMap, Observable, of, Subject, Subscription, tap, toArray } from 'rxjs';

import { NotificationService } from '../../../../core/notification/notification.service';
import { PromoSectionId } from '../../dictionaries/dictionary-loading';
import { HostFormService } from './host-form.service';

export interface ISaveResult {
    saved: PromoSectionId[];
    failed: PromoSectionId[];
}

const MAX_PARALLEL_SECTION_SAVES = 3;

/**
 * Координатор сохранения формы акции.
 *
 * - exhaustMap: повторное нажатие «Сохранить» во время сохранения игнорируется (нет дублей на бэкенде).
 * - Сохраняются только «грязные» разделы, параллельно, с ограничением конкурентности.
 * - defer: запрос раздела создаётся в момент подписки, а не при сборке цепочки.
 * - Ошибка одного раздела не останавливает остальные; итог отдаётся одним ISaveResult.
 */
@Injectable()
export class PromoSaveCoordinatorService implements OnDestroy {
    private readonly hostFormService = inject(HostFormService);
    private readonly notification = inject(NotificationService);

    private readonly saveTrigger$ = new Subject<void>();
    private readonly resultSubject = new Subject<ISaveResult>();

    public readonly saving$ = new BehaviorSubject<boolean>(false);
    public readonly result$: Observable<ISaveResult> = this.resultSubject.asObservable();

    private readonly subscription: Subscription = this.saveTrigger$
        .pipe(
            exhaustMap(() => {
                if (this.hostFormService.formRegistry.invalid) {
                    this.hostFormService.touchAll();
                    this.notification.error('Проверьте заполнение формы');
                    return EMPTY;
                }

                const dirtySectionIds = this.hostFormService.getDirtySectionIds();

                if (!dirtySectionIds.length) {
                    return EMPTY;
                }

                this.saving$.next(true);

                return from(dirtySectionIds).pipe(
                    mergeMap(sectionId => this.saveSection(sectionId), MAX_PARALLEL_SECTION_SAVES),
                    toArray(),
                    map(results => ({
                        saved: results.filter(result => result.ok).map(result => result.sectionId),
                        failed: results.filter(result => !result.ok).map(result => result.sectionId),
                    })),
                    tap(result => this.notifyResult(result)),
                    finalize(() => this.saving$.next(false)),
                );
            }),
        )
        .subscribe(result => this.resultSubject.next(result));

    public save(): void {
        this.saveTrigger$.next();
    }

    public ngOnDestroy(): void {
        this.subscription.unsubscribe();
        this.saveTrigger$.complete();
        this.resultSubject.complete();
    }

    private saveSection(sectionId: PromoSectionId): Observable<{ sectionId: PromoSectionId; ok: boolean }> {
        const handler = this.hostFormService.getSectionSaver(sectionId);

        if (!handler) {
            return of({ sectionId, ok: false });
        }

        return defer(() => handler.save()).pipe(
            catchError(() => of(false)),
            tap(ok => ok && this.hostFormService.markSectionSaved(sectionId)),
            map(ok => ({ sectionId, ok })),
        );
    }

    private notifyResult({ saved, failed }: ISaveResult): void {
        if (failed.length) {
            this.notification.error(`Не удалось сохранить разделов: ${failed.length}. Остальные изменения сохранены.`);
        } else if (saved.length) {
            this.notification.success('Акция сохранена');
        }
    }
}

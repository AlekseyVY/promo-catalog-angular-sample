import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, Input } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, EMPTY, exhaustMap, finalize, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { NotificationService } from '../../../core/notification/notification.service';
import { CatalogApiService } from '../data-access/catalog-api.service';
import { DictionaryBatchResult, PromoSectionId } from '../dictionaries/dictionary-loading';
import { IPromo } from '../domain/catalog.models';
import { PromoConditionsSectionComponent } from './sections/conditions-section.component';
import { PromoGeneralSectionComponent } from './sections/general-section.component';
import { HostFormService } from './services/host-form.service';
import { PromoSaveCoordinatorService } from './services/promo-save-coordinator.service';

/**
 * Хост-форма акции. Сам не содержит полей — только собирает разделы,
 * показывает общий статус и запускает сохранение.
 * promo и dictionaries приходят из резолверов через withComponentInputBinding().
 */
@Component({
    selector: 'app-promo-editor',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [HostFormService, PromoSaveCoordinatorService],
    imports: [AsyncPipe, PromoGeneralSectionComponent, PromoConditionsSectionComponent],
    template: `
        <h1>{{ promo.id === null ? 'Новая акция' : promo.title }}</h1>

        <app-promo-general-section [promo]="promo" [dictionaries]="dictionaries" />
        <app-promo-conditions-section [promo]="promo" />

        <footer class="actions">
            <button type="button" (click)="cancel()">Отмена</button>
            <button type="button" class="primary" [disabled]="saving$ | async" (click)="save()">
                {{ (saving$ | async) ? 'Сохранение…' : 'Сохранить' }}
            </button>
        </footer>
    `,
})
export class PromoEditorComponent {
    @Input({ required: true }) public promo!: IPromo;
    @Input({ required: true }) public dictionaries!: DictionaryBatchResult;

    private readonly hostForm = inject(HostFormService);
    private readonly coordinator = inject(PromoSaveCoordinatorService);
    private readonly api = inject(CatalogApiService);
    private readonly notification = inject(NotificationService);
    private readonly router = inject(Router);

    private readonly create$ = new Subject<void>();

    public readonly saving$ = this.coordinator.saving$;

    constructor() {
        // Новая акция сохраняется целиком одним запросом; существующая — по изменённым разделам.
        this.create$
            .pipe(
                exhaustMap(() => {
                    this.saving$.next(true);

                    return this.api.savePromo(this.collectPromo()).pipe(
                        // Ошибку гасим внутри exhaustMap, чтобы поток create$ не завершился.
                        catchError(() => {
                            this.notification.error('Не удалось создать акцию');
                            return EMPTY;
                        }),
                        finalize(() => this.saving$.next(false)),
                    );
                }),
                takeUntilDestroyed(),
            )
            .subscribe(created => {
                this.notification.success('Акция создана');
                this.router.navigate(['/catalog/promo', created.id], { replaceUrl: true });
            });
    }

    public save(): void {
        if (this.promo.id !== null) {
            this.coordinator.save();
            return;
        }

        if (this.hostForm.formRegistry.invalid) {
            this.hostForm.touchAll();
            return;
        }

        this.create$.next();
    }

    private collectPromo(): IPromo {
        const raw = this.hostForm.formRegistry.getRawValue();

        return {
            ...this.promo,
            ...(raw[String(PromoSectionId.GENERAL)] as Partial<IPromo>),
            conditions: raw[String(PromoSectionId.CONDITIONS)] as IPromo['conditions'],
        };
    }

    public cancel(): void {
        this.router.navigate(['/catalog']);
    }
}

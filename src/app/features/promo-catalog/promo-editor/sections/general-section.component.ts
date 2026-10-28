import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { distinctUntilChanged, map, startWith } from 'rxjs';

import { CatalogApiService } from '../../data-access/catalog-api.service';
import { DictionaryBatchResult, PromoSectionId } from '../../dictionaries/dictionary-loading';
import { IDictionaryItem, IPromo, PromoMechanic } from '../../domain/catalog.models';
import { HostFormService } from '../services/host-form.service';
import { dateRangeValidator, discountByMechanicValidator, firstErrorMessage } from '../validators/promo.validators';

@Component({
    selector: 'app-promo-general-section',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [AsyncPipe, ReactiveFormsModule],
    template: `
        <fieldset class="section" [formGroup]="form">
            <legend>Основное</legend>

            <label>
                Название акции
                <input formControlName="title" maxlength="200" />
                <small class="error">{{ error('title') }}</small>
            </label>

            <label>
                Механика
                <select formControlName="mechanic">
                    @for (item of mechanics; track item.id) {
                        <option [value]="item.code">{{ item.title }}</option>
                    }
                </select>
            </label>

            @if (hasDiscountValue$ | async) {
                <label>
                    Значение скидки
                    <input type="number" formControlName="discountValue" />
                </label>
            }
            <small class="error">{{ groupError() }}</small>

            <div class="row">
                <label>Начало <input type="date" formControlName="startDate" /></label>
                <label>Окончание <input type="date" formControlName="endDate" /></label>
            </div>

            <label>
                Регионы
                <select multiple formControlName="regionIds">
                    @for (item of regions; track item.id) {
                        <option [ngValue]="item.id">{{ item.title }}</option>
                    }
                </select>
                <small class="error">{{ error('regionIds') }}</small>
            </label>

            <label>
                Бюджет, ₽
                <input type="number" formControlName="budget" min="0" />
            </label>
        </fieldset>
    `,
})
export class PromoGeneralSectionComponent implements OnInit, OnDestroy {
    @Input({ required: true }) public promo!: IPromo;
    @Input({ required: true }) public dictionaries!: DictionaryBatchResult;

    private readonly fb = inject(FormBuilder);
    private readonly hostForm = inject(HostFormService);
    private readonly api = inject(CatalogApiService);
    private readonly destroyRef = inject(DestroyRef);

    public readonly form = this.fb.group(
        {
            title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
            mechanic: this.fb.nonNullable.control<PromoMechanic>(PromoMechanic.DISCOUNT_PERCENT, Validators.required),
            discountValue: this.fb.control<number | null>(null),
            startDate: this.fb.nonNullable.control('', Validators.required),
            endDate: this.fb.nonNullable.control('', Validators.required),
            regionIds: this.fb.nonNullable.control<number[]>([], Validators.required),
            budget: this.fb.control<number | null>(null, Validators.min(0)),
        },
        {
            validators: [dateRangeValidator('startDate', 'endDate'), discountByMechanicValidator('mechanic', 'discountValue')],
        },
    );

    public readonly hasDiscountValue$ = this.form.controls.mechanic.valueChanges.pipe(
        startWith(this.form.controls.mechanic.value),
        map(mechanic => mechanic !== PromoMechanic.N_PLUS_ONE),
        distinctUntilChanged(),
    );

    public mechanics: IDictionaryItem[] = [];
    public regions: IDictionaryItem[] = [];

    public ngOnInit(): void {
        const dictionaries = this.dictionaries.get(PromoSectionId.GENERAL) ?? {};
        this.mechanics = dictionaries['promo-mechanics'] ?? [];
        this.regions = dictionaries['regions'] ?? [];

        this.form.patchValue(this.promo, { emitEvent: false });

        // Для N+1 значение скидки не нужно — очищаем, чтобы не уехало на бэкенд.
        this.hasDiscountValue$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(hasValue => {
            if (!hasValue) {
                this.form.controls.discountValue.setValue(null);
            }
        });

        this.hostForm.registerForm(PromoSectionId.GENERAL, this.form);
        this.hostForm.registerSectionSaver(PromoSectionId.GENERAL, {
            save: () => this.api.savePromoSection(this.promo.id!, PromoSectionId.GENERAL, this.form.getRawValue()),
        });
    }

    public ngOnDestroy(): void {
        this.hostForm.unregister(PromoSectionId.GENERAL);
    }

    public error(controlName: keyof typeof this.form.controls): string | null {
        return firstErrorMessage(this.form.controls[controlName]);
    }

    public groupError(): string | null {
        return this.form.touched ? firstErrorMessage(this.form) : null;
    }
}

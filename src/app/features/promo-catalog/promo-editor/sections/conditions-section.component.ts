import { ChangeDetectionStrategy, Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CatalogApiService } from '../../data-access/catalog-api.service';
import { PromoSectionId } from '../../dictionaries/dictionary-loading';
import { IPromo, IPromoCondition } from '../../domain/catalog.models';
import { HostFormService } from '../services/host-form.service';
import { firstErrorMessage, uniqueProductsValidator } from '../validators/promo.validators';

type ConditionForm = FormGroup<{
    productId: FormControl<number | null>;
    minQuantity: FormControl<number | null>;
    limitPerCustomer: FormControl<number | null>;
}>;

/** Условия акции: динамический FormArray товаров с групповым валидатором уникальности. */
@Component({
    selector: 'app-promo-conditions-section',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <fieldset class="section">
            <legend>Товары и условия</legend>

            @for (row of conditions.controls; track row; let idx = $index) {
                <div class="row" [formGroup]="row">
                    <input type="number" placeholder="ID товара" formControlName="productId" />
                    <input type="number" placeholder="Мин. кол-во" formControlName="minQuantity" />
                    <input type="number" placeholder="Лимит на покупателя" formControlName="limitPerCustomer" />
                    <button type="button" (click)="removeCondition(idx)" aria-label="Удалить условие">✕</button>
                </div>
            }

            <small class="error">{{ arrayError() }}</small>
            <button type="button" (click)="addCondition()">Добавить товар</button>
        </fieldset>
    `,
})
export class PromoConditionsSectionComponent implements OnInit, OnDestroy {
    @Input({ required: true }) public promo!: IPromo;

    private readonly fb = inject(FormBuilder);
    private readonly hostForm = inject(HostFormService);
    private readonly api = inject(CatalogApiService);

    public readonly conditions: FormArray<ConditionForm> = this.fb.array<ConditionForm>([], {
        validators: [Validators.required, uniqueProductsValidator('productId')],
    });

    public ngOnInit(): void {
        this.promo.conditions.forEach(condition => this.conditions.push(this.createCondition(condition), { emitEvent: false }));

        this.hostForm.registerForm(PromoSectionId.CONDITIONS, this.conditions);
        this.hostForm.registerSectionSaver(PromoSectionId.CONDITIONS, {
            save: () => this.api.savePromoSection(this.promo.id!, PromoSectionId.CONDITIONS, this.conditions.getRawValue()),
        });
    }

    public ngOnDestroy(): void {
        this.hostForm.unregister(PromoSectionId.CONDITIONS);
    }

    public addCondition(): void {
        this.conditions.push(this.createCondition());
        this.conditions.markAsDirty();
    }

    public removeCondition(idx: number): void {
        this.conditions.removeAt(idx);
        this.conditions.markAsDirty();
    }

    public arrayError(): string | null {
        return firstErrorMessage(this.conditions);
    }

    private createCondition(value?: IPromoCondition): ConditionForm {
        return this.fb.group({
            productId: this.fb.control<number | null>(value?.productId ?? null, Validators.required),
            minQuantity: this.fb.control<number | null>(value?.minQuantity ?? 1, [Validators.required, Validators.min(1)]),
            limitPerCustomer: this.fb.control<number | null>(value?.limitPerCustomer ?? null, Validators.min(1)),
        });
    }
}

import { AbstractControl, FormArray, ValidationErrors, ValidatorFn } from '@angular/forms';

import { PromoMechanic } from '../../domain/catalog.models';

/** Дата окончания не раньше даты начала. Вешается на группу, чтобы реагировать на оба поля. */
export const dateRangeValidator =
    (startKey: string, endKey: string): ValidatorFn =>
    (group: AbstractControl): ValidationErrors | null => {
        const start = group.get(startKey)?.value as string | null;
        const end = group.get(endKey)?.value as string | null;

        if (!start || !end) {
            return null;
        }

        return new Date(end).getTime() < new Date(start).getTime() ? { dateRange: true } : null;
    };

/** Значение скидки зависит от механики: процент 1..99, фиксированная сумма > 0, N+1 — без значения. */
export const discountByMechanicValidator =
    (mechanicKey: string, valueKey: string): ValidatorFn =>
    (group: AbstractControl): ValidationErrors | null => {
        const mechanic = group.get(mechanicKey)?.value as PromoMechanic | null;
        const value = group.get(valueKey)?.value as number | null;

        switch (mechanic) {
            case PromoMechanic.DISCOUNT_PERCENT:
                return value === null || value < 1 || value > 99 ? { discountPercent: { min: 1, max: 99 } } : null;
            case PromoMechanic.DISCOUNT_FIXED:
            case PromoMechanic.SPECIAL_PRICE:
                return value === null || value <= 0 ? { discountPositive: true } : null;
            default:
                return null;
        }
    };

/** Один и тот же товар не может дважды встречаться в условиях акции. */
export const uniqueProductsValidator =
    (productKey = 'productId'): ValidatorFn =>
    (control: AbstractControl): ValidationErrors | null => {
        const array = control as FormArray;
        const seen = new Set<unknown>();
        const duplicates: number[] = [];

        array.controls.forEach((item, idx) => {
            const id = item.get(productKey)?.value;

            if (id === null || id === undefined) {
                return;
            }

            if (seen.has(id)) {
                duplicates.push(idx);
            }

            seen.add(id);
        });

        return duplicates.length ? { duplicateProducts: duplicates } : null;
    };

export const VALIDATION_MESSAGES: Record<string, (error: unknown) => string> = {
    required: () => 'Обязательное поле',
    maxlength: error => `Не больше ${(error as { requiredLength: number }).requiredLength} символов`,
    min: error => `Не меньше ${(error as { min: number }).min}`,
    dateRange: () => 'Дата окончания раньше даты начала',
    discountPercent: () => 'Скидка от 1 до 99 %',
    discountPositive: () => 'Значение должно быть больше 0',
    duplicateProducts: () => 'Товар уже добавлен в условия',
};

export function firstErrorMessage(control: AbstractControl | null): string | null {
    if (!control?.errors || !control.touched) {
        return null;
    }

    const [key, value] = Object.entries(control.errors)[0];

    return VALIDATION_MESSAGES[key]?.(value) ?? 'Некорректное значение';
}

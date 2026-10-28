import { Injectable } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { EMPTY, map, merge, Observable, of, startWith, switchMap } from 'rxjs';

import { PromoSectionId } from '../../dictionaries/dictionary-loading';

export interface ISectionSaveHandlerConfig {
    save: () => Observable<boolean>;
    isDirty?: () => boolean;
    markSaved?: () => void;
}

export interface ISectionSaveHandler extends ISectionSaveHandlerConfig {
    sectionId: PromoSectionId;
}

/**
 * Централизованный реестр форм разделов промо-акции.
 *
 * Каждый раздел — самостоятельный standalone-компонент со своей FormGroup.
 * Разделы регистрируют форму и обработчик сохранения здесь, а хост-компонент
 * видит общую валидность/«грязность» и сохраняет только изменённые разделы.
 * Так разделы не знают друг о друге, а их можно рендерить в любой раскладке
 * (вкладки, единый скролл, режим только чтения).
 */
@Injectable()
export class HostFormService {
    public readonly formRegistry = new FormGroup<Record<string, AbstractControl>>({});

    private readonly saveRegistry = new Map<PromoSectionId, ISectionSaveHandler>();

    public registerForm(sectionId: PromoSectionId, form: AbstractControl): void {
        const key = String(sectionId);
        const existingForm = this.formRegistry.get(key);

        if (existingForm === null) {
            this.formRegistry.addControl(key, form);
            return;
        }

        // Раздел пересоздан (например, переключили режим) — подменяем контрол, а не дублируем.
        if (existingForm !== form) {
            this.formRegistry.setControl(key, form);
        }
    }

    public unregister(sectionId: PromoSectionId): void {
        this.formRegistry.removeControl(String(sectionId));
        this.saveRegistry.delete(sectionId);
    }

    public getForm(sectionId: PromoSectionId): AbstractControl | undefined {
        return this.formRegistry.get(String(sectionId)) ?? undefined;
    }

    /** Поток формы раздела: эмитит при регистрации и при каждом изменении значения. */
    public getForm$(sectionId: PromoSectionId): Observable<AbstractControl> {
        return this.formRegistry.valueChanges.pipe(
            startWith(null),
            map(() => this.formRegistry.get(String(sectionId))),
            switchMap(control => (control === null ? EMPTY : merge(of(control), control.valueChanges.pipe(map(() => control))))),
        );
    }

    public registerSectionSaver(sectionId: PromoSectionId, config: ISectionSaveHandlerConfig): void {
        this.saveRegistry.set(sectionId, {
            sectionId,
            save: config.save,
            isDirty: config.isDirty ?? (() => this.getForm(sectionId)?.dirty ?? false),
            markSaved: config.markSaved ?? (() => this.getForm(sectionId)?.markAsPristine()),
        });
    }

    public getDirtySectionIds(): PromoSectionId[] {
        return Array.from(this.saveRegistry.values())
            .filter(handler => handler.isDirty?.() ?? false)
            .map(handler => handler.sectionId);
    }

    public getSectionSaver(sectionId: PromoSectionId): ISectionSaveHandler | undefined {
        return this.saveRegistry.get(sectionId);
    }

    public markSectionSaved(sectionId: PromoSectionId): void {
        this.saveRegistry.get(sectionId)?.markSaved?.();
    }

    /** Показать ошибки во всех разделах сразу (после попытки сохранить невалидную форму). */
    public touchAll(): void {
        this.formRegistry.markAllAsTouched();
    }
}

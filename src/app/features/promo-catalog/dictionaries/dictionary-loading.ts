import { inject, Injectable, InjectionToken, Provider } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { catchError, forkJoin, map, Observable, of, shareReplay } from 'rxjs';

import { NotificationService } from '../../../core/notification/notification.service';
import { CatalogApiService, DictionaryCode } from '../data-access/catalog-api.service';
import { IDictionaryItem } from '../domain/catalog.models';

export enum PromoSectionId {
    GENERAL = 1,
    CONDITIONS = 2,
}

export interface IDictionaryLoadContext {
    promoId: number | null;
}

export interface IDictionaryChunkResult {
    sectionId: PromoSectionId;
    payload: Record<string, IDictionaryItem[]>;
}

export type DictionaryBatchResult = Map<PromoSectionId, IDictionaryChunkResult['payload']>;

/**
 * Каждый раздел формы описывает, какие справочники ему нужны.
 * Регистрируются через multi-provider — новый раздел подключается одной строкой,
 * без правок загрузчика.
 */
export interface IDictionaryChunk {
    readonly sectionId: PromoSectionId;
    load(context: IDictionaryLoadContext): Observable<IDictionaryChunkResult>;
}

export const PROMO_DICTIONARY_CHUNK = new InjectionToken<IDictionaryChunk[]>('PROMO_DICTIONARY_CHUNK');

/**
 * Кэш справочников на время жизни приложения: справочники меняются редко,
 * а открываются на каждой форме. shareReplay также склеивает параллельные запросы.
 */
@Injectable({ providedIn: 'root' })
export class DictionaryCacheService {
    private readonly api = inject(CatalogApiService);
    private readonly cache = new Map<DictionaryCode, Observable<IDictionaryItem[]>>();

    public get(code: DictionaryCode): Observable<IDictionaryItem[]> {
        let request$ = this.cache.get(code);

        if (!request$) {
            request$ = this.api.getDictionary(code).pipe(
                map(items => items.filter(item => !item.isArchived)),
                catchError(error => {
                    // Ошибку не кэшируем — следующий вызов попробует снова.
                    this.cache.delete(code);
                    throw error;
                }),
                shareReplay({ bufferSize: 1, refCount: false }),
            );
            this.cache.set(code, request$);
        }

        return request$;
    }
}

abstract class BaseDictionaryChunk implements IDictionaryChunk {
    protected readonly dictionaries = inject(DictionaryCacheService);
    protected readonly notification = inject(NotificationService);

    public abstract readonly sectionId: PromoSectionId;
    protected abstract readonly codes: DictionaryCode[];

    public load(_context: IDictionaryLoadContext): Observable<IDictionaryChunkResult> {
        const requests = Object.fromEntries(
            this.codes.map(code => [
                code,
                this.dictionaries.get(code).pipe(
                    // Падение одного справочника не должно ломать всю форму.
                    catchError(() => {
                        this.notification.error(`Не удалось загрузить справочник «${code}»`);
                        return of<IDictionaryItem[]>([]);
                    }),
                ),
            ]),
        );

        return forkJoin(requests).pipe(map(payload => ({ sectionId: this.sectionId, payload })));
    }
}

@Injectable()
export class GeneralSectionDictionaryChunk extends BaseDictionaryChunk {
    public readonly sectionId = PromoSectionId.GENERAL;
    protected readonly codes: DictionaryCode[] = ['promo-mechanics', 'regions'];
}

@Injectable()
export class ConditionsSectionDictionaryChunk extends BaseDictionaryChunk {
    public readonly sectionId = PromoSectionId.CONDITIONS;
    protected readonly codes: DictionaryCode[] = ['categories', 'brands', 'suppliers', 'stores'];
}

export const PROMO_DICTIONARY_PROVIDERS: Provider[] = [
    { provide: PROMO_DICTIONARY_CHUNK, useClass: GeneralSectionDictionaryChunk, multi: true },
    { provide: PROMO_DICTIONARY_CHUNK, useClass: ConditionsSectionDictionaryChunk, multi: true },
];

/**
 * Резолвер грузит справочники всех разделов параллельно одним forkJoin
 * до открытия формы: форма рисуется сразу целиком, без «прыгающих» селектов.
 */
export const promoDictionariesResolver: ResolveFn<DictionaryBatchResult> = route => {
    const chunks = inject(PROMO_DICTIONARY_CHUNK);
    const rawId = route.paramMap.get('promoId');
    const context: IDictionaryLoadContext = { promoId: rawId && rawId !== 'new' ? Number(rawId) : null };

    return forkJoin(chunks.map(chunk => chunk.load(context))).pipe(
        map(results => new Map(results.map(result => [result.sectionId, result.payload]))),
    );
};

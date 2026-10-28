import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { API_CONFIG } from '../../../core/api/api-config';
import { IDictionaryItem, IProduct, IProductListRequest, IPromo, PromoId } from '../domain/catalog.models';

export interface IPaginatedResponse<T> {
    items: T[];
    total: number;
}

export type DictionaryCode = 'categories' | 'brands' | 'suppliers' | 'regions' | 'promo-mechanics' | 'stores';

@Injectable({ providedIn: 'root' })
export class CatalogApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(API_CONFIG).baseUrl;

    public getProductList(request: IProductListRequest): Observable<IProduct[]> {
        const params = new HttpParams({
            fromObject: {
                filter: request.filter,
                subfilter: request.subfilter,
                sortBy: request.sort.attributeName,
                sortOrder: request.sort.sortOrder,
                ...(request.searchString ? { search: request.searchString } : {}),
                ...(request.regionId !== null ? { regionId: request.regionId } : {}),
            },
        });

        return this.http
            .get<IPaginatedResponse<IProduct>>(`${this.baseUrl}/catalog/products`, { params })
            .pipe(map(response => response.items));
    }

    public getDictionary(code: DictionaryCode): Observable<IDictionaryItem[]> {
        return this.http.get<IDictionaryItem[]>(`${this.baseUrl}/dictionaries/${code}`);
    }

    public getPromo(id: PromoId): Observable<IPromo> {
        return this.http.get<IPromo>(`${this.baseUrl}/promos/${id}`);
    }

    public savePromo(promo: IPromo): Observable<IPromo> {
        return promo.id === null
            ? this.http.post<IPromo>(`${this.baseUrl}/promos`, promo)
            : this.http.put<IPromo>(`${this.baseUrl}/promos/${promo.id}`, promo);
    }

    public savePromoSection<T>(promoId: PromoId, sectionId: number, body: T): Observable<boolean> {
        return this.http
            .post<{ result: boolean }>(`${this.baseUrl}/promos/${promoId}/sections/${sectionId}`, body)
            .pipe(map(data => data.result));
    }
}

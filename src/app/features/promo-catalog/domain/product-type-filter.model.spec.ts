import { IProduct, PromoStatus } from './catalog.models';
import {
    buildProductTypeCounts,
    filterProductsByHeaderState,
    ProductSubFilterEnum,
    productTypeFilters,
} from './product-type-filter.model';

const NOW = new Date('2026-03-10T12:00:00Z');

function product(patch: Partial<IProduct>): IProduct {
    return {
        id: 1,
        sku: 'SKU-1',
        barcode: null,
        name: 'Товар',
        brand: null,
        categoryId: 1,
        categoryName: 'Бакалея',
        supplierName: null,
        regularPrice: 100,
        promoPrice: null,
        stock: 50,
        isActive: true,
        isSeasonal: false,
        promoId: null,
        promoStatus: null,
        promoEndsAt: null,
        ...patch,
    };
}

describe('product-type-filter.model', () => {
    const list: IProduct[] = [
        product({ id: 1, name: 'Молоко 3,2%', promoId: 10, promoStatus: PromoStatus.ACTIVE, promoEndsAt: '2026-03-11T00:00:00Z' }),
        product({ id: 2, name: 'Сыр', promoId: 11, promoStatus: PromoStatus.ON_APPROVAL, stock: 3 }),
        product({ id: 3, name: 'Ёлочная игрушка', isSeasonal: true }),
    ];

    it('считает счётчики всех чипов за один проход', () => {
        const counts = buildProductTypeCounts(list, productTypeFilters, NOW);

        expect(counts.get(ProductSubFilterEnum.ALL)).toBe(3);
        expect(counts.get(ProductSubFilterEnum.ACTIVE_PROMO)).toBe(1);
        expect(counts.get(ProductSubFilterEnum.ENDING_SOON)).toBe(1);
        expect(counts.get(ProductSubFilterEnum.ON_APPROVAL)).toBe(1);
        expect(counts.get(ProductSubFilterEnum.LOW_STOCK)).toBe(1);
        expect(counts.get(ProductSubFilterEnum.SEASONAL)).toBe(1);
        expect(counts.get(ProductSubFilterEnum.WITHOUT_PROMO)).toBe(1);
    });

    it('поиск не зависит от регистра и буквы «ё»', () => {
        expect(filterProductsByHeaderState(list, ProductSubFilterEnum.ALL, 'ЕЛОЧНАЯ').map(p => p.id)).toEqual([3]);
    });

    it('совмещает фильтр по типу и строку поиска', () => {
        expect(filterProductsByHeaderState(list, ProductSubFilterEnum.WITHOUT_PROMO, 'сыр')).toEqual([]);
        expect(filterProductsByHeaderState(list, ProductSubFilterEnum.ON_APPROVAL, 'сыр').map(p => p.id)).toEqual([2]);
    });
});

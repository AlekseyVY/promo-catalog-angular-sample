import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface INotification {
    type: 'success' | 'error' | 'info';
    text: string;
}

/**
 * Тонкая обёртка над UI-уведомлениями. Компонент-тостер подписывается на messages$,
 * остальной код не зависит от конкретного UI-кита.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
    private readonly messagesSubject = new Subject<INotification>();

    public readonly messages$: Observable<INotification> = this.messagesSubject.asObservable();

    public success(text: string): void {
        this.messagesSubject.next({ type: 'success', text });
    }

    public error(text: string): void {
        this.messagesSubject.next({ type: 'error', text });
    }
}

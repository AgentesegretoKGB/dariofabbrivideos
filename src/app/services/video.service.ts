import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Video } from '../models/video.model';

@Injectable({ providedIn: 'root' })
export class VideoService {
constructor(private http: HttpClient) { }
loadAll(): Observable<Video[]> {
return this.http.get<Video[]>('/assets/videos.json');
}
}
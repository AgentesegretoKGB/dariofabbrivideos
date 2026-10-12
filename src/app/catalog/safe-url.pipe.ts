import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Pipe({
  name: 'safeUrl'
})
export class SafeUrlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  // Accept string | undefined and return SafeResourceUrl | null so templates
  // that may pass undefined don't trigger TS type errors.
  transform(value: string | undefined): SafeResourceUrl | null {
    if (!value) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(value);
  }
}

/**
 * Detail page: screenshots open in an overlay at full size, scaled down only
 * as far as the window requires. The screenshot links point at the image
 * files, so without this script (or with a modifier click) they open the
 * image directly.
 */
export function initLightbox(): void {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-lightbox]'));
  if (links.length === 0 || typeof HTMLDialogElement === 'undefined') return;

  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  dialog.setAttribute('aria-label', 'Screenshot');
  dialog.innerHTML =
    '<button type="button" class="lightbox__close" aria-label="Close">' +
    '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="1em" height="1em"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="m3.5 3.5 9 9m0-9-9 9"/></svg>' +
    '</button><figure class="lightbox__figure"><img class="lightbox__image" alt=""><figcaption class="lightbox__caption"></figcaption></figure>';
  document.body.append(dialog);

  const image = dialog.querySelector('img') as HTMLImageElement;
  const caption = dialog.querySelector('figcaption') as HTMLElement;

  // Any click closes: the backdrop, the image, or the button. Nothing inside
  // the overlay is interactive besides closing it.
  dialog.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
  });

  for (const link of links) {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const thumb = link.querySelector('img');
      const text = link.closest('figure')?.querySelector('figcaption')?.textContent?.trim() ?? '';
      image.src = link.href;
      image.alt = thumb?.alt ?? '';
      caption.textContent = text;
      caption.hidden = text === '';
      dialog.setAttribute('aria-label', image.alt || 'Screenshot');
      dialog.showModal();
    });
  }
}

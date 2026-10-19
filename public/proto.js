// Short typed logo for the prototypes: Sgnfai typed in, the dot goes in (Sgnf.ai), then comes back out.
// About 2.4s. Elements with data-type-logo replay on click; data-autoplay also plays once on load.
(function () {
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-type-logo]').forEach(function (el) {
    var w = el.querySelector('.logo__word'), c = el.querySelector('.logo__cursor'), run = 0;

    function draw(s, p) {
      w.textContent = s;
      var x = 0;
      if (w.firstChild && p > 0) {
        var r = document.createRange();
        r.setStart(w.firstChild, 0); r.setEnd(w.firstChild, p);
        x = r.getBoundingClientRect().width;
      }
      c.style.left = x + 'px';
    }
    // a newer run makes older waits bail out
    function wait(ms, id) {
      return new Promise(function (ok, stop) {
        setTimeout(function () { id === run ? ok() : stop('stale'); }, ms);
      });
    }

    async function play() {
      var id = ++run;
      try {
        c.style.opacity = 1;
        for (var i = 0; i <= 6; i++) { draw('Sgnfai'.slice(0, i), i); await wait(i ? 70 : 250, id); }
        await wait(250, id);
        draw('Sgnfai', 4); await wait(200, id);
        draw('Sgnf.ai', 5); await wait(700, id);
        draw('Sgnfai', 4); await wait(200, id);
        draw('Sgnfai', 6); await wait(400, id);
        c.style.opacity = 0;
      } catch (e) { /* superseded */ }
    }

    el.addEventListener('click', function () { if (!reduced) play(); });
    if (!reduced && el.hasAttribute('data-autoplay')) play();
  });
})();

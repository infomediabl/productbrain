(function() {
  const tocList = document.getElementById('toc-list');
  const sections = Array.from(document.querySelectorAll('h2[id]'));

  // Build TOC from h2 headings
  sections.forEach(function(h2) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + h2.id;
    a.textContent = h2.textContent;
    a.addEventListener('click', function(e) {
      e.preventDefault();
      h2.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', '#' + h2.id);
    });
    li.appendChild(a);
    tocList.appendChild(li);
  });

  // Scrollspy: highlight current section in TOC
  var tocLinks = tocList.querySelectorAll('a');
  function onScroll() {
    var scrollY = window.scrollY + 120;
    var current = '';
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop <= scrollY) {
        current = sections[i].id;
      }
    }
    tocLinks.forEach(function(a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
  }
  window.addEventListener('scroll', onScroll);
  onScroll();

  // Collapsible detail sections
  document.querySelectorAll('.guide-collapse-toggle').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var target = document.getElementById(btn.getAttribute('data-target'));
      if (!target) return;
      var expanded = target.style.display !== 'none';
      target.style.display = expanded ? 'none' : 'block';
      btn.setAttribute('aria-expanded', !expanded);
      btn.querySelector('.collapse-icon').textContent = expanded ? '\u25B6' : '\u25BC';
    });
  });
})();

$('body').on('touchstart', 'button', function(event) {
  var elem = $(event.srcElement);
  elem.addClass('touched');

  $('body').one('touchend', function(event2) {
    elem.removeClass('touched');
  });
});
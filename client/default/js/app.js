// This is a function which allow us to demonstrate the app, which listens
// exclusively to tap events (in order to avoid the slight delays in click
// events mobile browser engines introduce), by firing those tap events when we
// detect a genuine click, while also allowing us to scroll etc...
$('body').on('mousedown', function(event) {
  if (!(/mobile/i.test(navigator.userAgent)) && !('ontouchstart' in window)) {

    $('body')
      .one('mousemove', function() {
        $('body').off('mouseup');
      })
      .one('mouseup', function() {
          $(event.srcElement).trigger('tap');
      });
  }
});

// Allows us to check whether our SalesForce API session should still be valid
// or timed out, with a 5 minute 'insurance' against making bad calls.
function isSessionTimedOut() {
  var timeString = localStorage.getItem('timestamp'),
      time;

  if (timeString) {
    time = new Date(timeString);

    // Check if it's at least 115 minutes old...
    if ((new Date()) - time >= 6900000) {
      return true;
    }
  }
  return false;
}

// There's a couple of things we'll always want to do, and provide as arguments,
// when making act request in this app, so we wrap them up and make it DRY.
function doAct(act, req, onSuccess, onFailure) {
  var authData = localStorage.getItem('authData');

  // TODO: Figure out why this doesn't seem to be kicking in on first load.
  window.app.viewport.loadMask(true);

  function wrappedSuccess(res) {
    window.app.viewport.loadMask(false);
    localStorage.setItem('timestamp', (new Date()).toJSON());
    onSuccess(res);
  }

  function wrappedFailure(msg, err) {
    window.app.viewport.loadMask(false);
    onFailure(msg, err);
  }

  $fh.act({
    act: act,
    req: req ? req : authData ? JSON.parse(authData) : undefined
  }, wrappedSuccess, onFailure);
}

// Custom Backbone.sync which currently only allows us to fetch all items from
// a collection.
Backbone.sync = function(method, collection, options) {
  var act = collection.act;

  if (method !== 'read') {
    return options.error('Only read ops supported at the moment!');
  }

  return doAct(act, null,
    function(res) {
      var resp = res.records;
      options.success(resp);
    }, options.error);
};

app = (function() {

  // We don't need any custom logic for our models or collections, so we can use
  // the generic Backbone base classes for everything.
  var SalesforceItem = Backbone.Model.extend();
  var SalesforceCollection = Backbone.Collection.extend({
    model:SalesforceItem
  });

  // We've decided to implement a custom sorting function for the cases, so we
  // have a custom object for this.
  var Cases = SalesforceCollection.extend({
    act: 'listCases',

    comparator: function comparator(aCase) {
      return aCase.get('IsClosed') ? 2 : 1;
    }
  });

  // These are the items we're dealing with in this simple example app.
  window.collections = {
    accounts: new (SalesforceCollection.extend({act:'listAccounts'})),
    cases: new Cases(),
    campaigns: new (SalesforceCollection.extend({act:'listCampaigns'})),
    opportunities: new (SalesforceCollection.extend({act:'listOpps'}))
  };

  // The main application viewport and visual hub of the app. Because there
  // should be only one of these for the app, we render to the page on init.
  var AppViewport = Backbone.View.extend({
    tagName: 'div',
    id: 'app-viewport',
    viewport: null,
    scrollers: [],
    currentView: null,

    events: {
      'tap #menu-button': 'toggleMenu',

      // TODO: Make these global, providing opt-out based on class.
      'click a': 'stopLink',
      'tap a': 'followLink'
    },

    // Provide this hardcoded in order to take it out of users HTML file.
    // TODO: Provide dynamic menu rendering (_.template() ?)
    template: [
      '<div id="app-menu">',
        '<ul id="app-menu-list">',
          '<li><a class="ss-users" href="/#accounts">Accounts</a></li>',
          '<li><a class="ss-notebook" href="/#cases">Cases</a></li>',
          '<li><a class="ss-stopwatch" href="/#campaigns">Campaigns</a></li>',
          '<li><a class="ss-target" href="/#opportunities">Opportunities</a></li>',
          '<li><a class="ss-reply" href="/#logout">Logout</a></li>',
        '</ul>',
      '</div>',
        '<div id="viewport-wrapper">',
        '<header id="titlebar">',
          '<button id="menu-button" class="ss-icon">list</button>',
          '<h1>SalesHenry</h1>',
          '<button id="context-button" class="ss-icon"><span class="active">sync</span></button>',
        '</header>',
        '<section id="main-viewport">',
        '</section>',
      '</div>'
    ].join('\n'),

    initialize: function() {
      _.bindAll(this);

      this.$el.html(this.template);
      $('body').append(this.$el);

      // Store the viewport element, we'll be using it a lot...
      this.viewport = this.$('#main-viewport');

      if (this.$('#app-menu-list').height() > $(window).height()) {
        this.scrollers.push(new iScroll('app-menu'));
      }

      // Setup phonegap event listener for Android menu button.
      document.addEventListener("menubutton", this.toggleMenu, false);

      this.on('pagechange', this.closeMenu);
    },

    setView: function(NewView, attributesToAdd) {
      var hash = window.location.hash,
          newView,
          menuListItems = $('#app-menu-list li'),
          menuListLength = menuListItems.length,
          i, curItem, titlebar;

      // Adjust menu item styling first to make seem extra responsive.
      for (i = 0; i < menuListLength; i++) {
        curItem = $(menuListItems[i]).find('a');
        if (curItem.attr('href').search(hash.split('/')[0]) === 1) {
          curItem.addClass('selected');
        } else {
          curItem.removeClass('selected');
        }
      }

      // Page views should destroy all iScrolls etc. before removal. We don't
      // need to do explicit empty() call, because later html() does this.
      if (this.currentView && this.currentView.destroy) this.currentView.destroy();

      if (attributesToAdd) {
        newView = new NewView(attributesToAdd);
      } else {
        newView = new NewView();
      }
      this.currentView = newView;

      titlebar = (newView.titlebar || newView.options.titlebar);

      if (titlebar) {
        this.$('#titlebar h1').text(titlebar.title);
        this.$('#titlebar').removeClass('hidden');

        // This gives us option of adjusting page padding/margin etc. to adjust
        // for lack of titlebar.
        this.viewport.addClass('with-titlebar');
      } else {
        this.$('#titlebar').addClass('hidden');
        this.viewport.removeClass('with-titlebar');
      }

      this.viewport.html(newView.render().el);

      if (newView.isChild) {
        $('#menu-button').html('previous');
      } else {
        $('#menu-button').html('list');
      }

      if (newView.afterRender) newView.afterRender();

      if (newView.setupScroll) {
        setTimeout(newView.setupScroll, 100);
      }
    },

    // Just a simple function to cancel any onclick events, which were following
    // through (delayed) from a tap on the menu item.
    stopLink: function(event) {

      if (/^www/.test(event.srcElement.pathname.substring(1))) {
        window.location = 'http://' + event.srcElement.pathname.substring(1);
        this.trigger('pagechange');
        return false;
      }

      if (event.srcElement.hash.charAt(0) === '#') {
        return false;

      }

      // If the element is a link tag pointing to a
      return (event.srcElement.nodeName === 'A' &&
        (event.srcElement.href.substring(0, 4) === 'tel:' ||
          event.srcElement.href.substring(0, 4) === 'http') &&
         !event.srcElement.hash);
    },

    // Works around the above, with the added bonus of circumventing the short
    // delay between tap and onclick events on mobile.
    followLink: function(event) {
      if (event.srcElement.hash.charAt(0) === '#') {
        window.app.navigate(event.srcElement.hash.substring(1), {trigger: true});
        this.trigger('pagechange');
      }
      // this.toggleMenu();
    },

    closeMenu: function closeMenu() {
      var elem = this.$('#viewport-wrapper'),
          width = $(window).width() - this.$('#menu-button').width();


      if (elem.css('-webkit-transform') === 'translateX(' + width + 'px)') {
        elem.css('-webkit-transform', 'translateX(0)');
      }
    },

    toggleMenu: function toggleMenu(event) {

      // TODO: Assess if necessary.
      if (event) event.stopPropagation();

      if (this.currentView.isChild) {
        window.history.back();
        return false;
      }

      var elem = this.$('#viewport-wrapper'),
          width = $(window).width() - this.$('#menu-button').width();

      console.log(elem.css('-webkit-transform'));
      if (elem.css('-webkit-transform') === 'translateX(' + width + 'px)') {
        elem.css('-webkit-transform', 'translateX(0)');
      } else {
        elem.css('-webkit-transform', 'translateX(' + width + 'px)');
      }
    },

    loadMask: function loadMask(display) {
      var loaderElem = this.$('#context-button');
      if (display) {
        loaderElem.addClass('active');
      } else {
        loaderElem.removeClass('active');
      }
    }

    // TODO: Cache any selectors which are used many times in functions.
  });

  var AccountsView = Backbone.View.extend({
    tagName: 'section',
    className: 'page',
    id: 'accounts-page',

    titlebar: {
      title: 'Accounts'
    },

    initialize: function() {
      _.bindAll(this);

      if (!collections.accounts.length) {
        collections.accounts.fetch();
      }

      collections.accounts.on('reset', this.render);
    },

    destroy: function destroy() {
      if (this.scroller) {
        this.scroller.destroy();
        this.scroller = null;
      }
    },

    render: function() {
      var that = this,
          accountList = $('<ul id="accounts-list"></ul>');

      collections.accounts.each(function(account) {
        accountList.append((new AccountListItemView({ model: account })).render().el);
      });

      this.$el.html(accountList);

      setTimeout(function() {
        new iScroll(that.id);
      }, 100);

      return this;
    }
  });

  var AccountListItemView = Backbone.View.extend({
    tagName: 'li',

    events: {
      'tap': 'viewItem'
    },

    viewItem: function viewItem() {
      window.app.navigate('accounts/' + this.model.get('AccountNumber'), {trigger: true});
    },

    initialize: function initialize() {
      this.template = _.template($('#account-list-item-tpl').html());
      _.bindAll(this);
    },

    render: function render() {
      this.$el.html(this.template(this.model.toJSON()));
      return this;
    }
  })




  // CASES SECTION
  // ---------------------------------------------------------------------------

  var CasesView = Backbone.View.extend({
    tagName: 'section',
    className: 'page',
    id: 'cases-page',

    titlebar: {
      title: 'Cases'
    },

    events: {
      'tap li': 'viewSingle'
    },

    initialize: function() {
      _.bindAll(this);

      if (!collections.cases.length) {
        collections.cases.fetch();
      }

      collections.cases.on('reset', this.render);
    },



    viewSingle: function viewSingle(event) {
      window.app.navigate('case/123', {trigger: true});
    },

    render: function() {
      var that = this;

      var list = $('<ul id="cases-list"></ul>');

      function buildList() {
        collections.cases.each(function(acase) {
          list.append('<li><span class="' + acase.get('Priority') + '-priority ' + acase.get('IsClosed') + '">' + acase.get('Subject') + '</span></li>');
        });
        that.$el.html(list);


      }

      buildList();

      setTimeout(function() {
        new iScroll(that.id);
      }, 100);

      return this;
    }
  });

  var SingleCasePage = Backbone.View.extend({
    tagName: 'section',
    className: 'page',
    id: 'single-case-page',

    titlebar: {
      title: 'Cases'
    },

    render: function render() {
      this.$el.html('<h1>Single Case Page</h1>');
      return this;
    }
  });

  var SingleAccountPage = Backbone.View.extend({
    tagName: 'section',
    className: 'page',
    id: 'single-account-page',
    model: null,

    titlebar: {
      title: 'Accounts'
    },

    events: {
      'tap .account-head': 'openMap'
    },

    openMap: function openMap() {
      window.location = 'http://maps.google.com/maps?q=' + this.getEscapedAddress();
    },

    initialize: function() {
      _.bindAll(this);
      this.$el.swipeRight(this.goBack);

    },

    goBack: function() {
      window.history.back();
    },

    getEscapedAddress: function getEscapedAddress() {
      var address = [
        this.model.get('BillingStreet'),
        this.model.get('BillingCity'),
        this.model.get('BillingState'),
        this.model.get('BillingCountry')
      ].join(', ');

      return address.replace(/\s/g, '+');
    },

    render: function render() {
      var that = this,
          raw,
          i,
          width = $(window).width(),
          mapUrl = 'http://maps.googleapis.com/maps/api/staticmap?zoom=13&size=' + width + 'x' + Math.round(width * .67) + '&maptype=roadmap&sensor=false&center=';

      mapUrl += this.getEscapedAddress();

      // If we're on retina, upscale the image to keep quality perfect.
      mapUrl += window.devicePixelRatio > 1 ? '&scale=2' : '';

      console.log(mapUrl);

      this.$el.html(_.template($('#account-item-tpl').html(), this.model.toJSON()));

      raw = '<table>';
      for (i = 1; i < Object.keys(this.model.attributes).length; i++) {
        raw += '<tr><td>' + Object.keys(this.model.attributes)[i] + '</td><td>' + this.model.attributes[Object.keys(this.model.attributes)[i]] + '</td></tr>';
      }
      raw += '</table>';

      $(this.$('div')[0]).append(raw);

      this.$('.account-head').css('background-image', 'url(' + mapUrl + ')');

      setTimeout(function() {
        new iScroll(that.id);
      }, 100);

      return this;
    }
  });




  var CampaignsView = Backbone.View.extend({
    tagName: 'section',
    className: 'page',
    id: 'campaigns-page',

    titlebar: {
      title: 'Campaigns'
    },

    events: {
      // 'tap li': 'viewAccount'
    },

    initialize: function() {
      if (!collections.campaigns) {
        window.app.viewport.loadMask(true);
        $fh.act({
          act: 'listCampaigns',
          req: JSON.parse(localStorage.getItem('authData'))
        }, function(res) {
          console.log(res);
          collections.campaigns = new SalesforceCollection(res.records);
          window.app.viewport.loadMask(false);
        }, function(err) {
          alert(err);
        });
      }
    },

    render: function() {
      window.app.viewport.loadMask(true);
      var thisScroller;
      var that = this;
      this.$el.append('<ul id="campaigns-list">');

      function buildList() {
        collections.campaigns.each(function(campaign) {
          $('#campaigns-list').append('<li>' + campaign.get('Name') + '</li>');
        });
        that.$el.append('</ul>');
        thisScroller = new iScroll(that.id);
        window.app.viewport.loadMask(false);
      }

      if (!this.collection) {
        setTimeout(buildList, 1000);
        console.log(this.id);

      } else {
        buildList();
      }

      //if (this.$el.height() - this.$('#accounts-list').height() < 0) {
//        thisScroller = new iScroll(this.id);
      //}


      return this;
    }
  });



  var LoginPage = Backbone.View.extend({
    tagName: 'section',
    className: 'page',
    id: 'login-page',

    titlebar: false,

    events: {
      'tap #login-message': 'fillForm',
      'focusin input': 'toggleIconColor',
      'focusout input': 'toggleIconColor',
      'keyup input': 'toggleClear',
      'tap .clear-input': 'clearInput',
      'tap #login-button': 'login'
    },

    fillForm: function fillForm() {
      this.$('#email-input').val('gareth.murphy@feedhenry.com');
      this.$('#password-input').val('feedhenrysf1Z7wET5DzlujYVa9gIEAOBzmLI');
      this.$('.clear-input').css('display', 'block');
    },

    toggleClear: function toggleClear(event) {
      var elem = event.srcElement;
      if (elem.value === '') {
        $(elem).siblings('.clear-input').css('display', 'none');
      } else {
        $(elem).siblings('.clear-input').css('display', 'block');
      }
    },

    initialize: function() {
      // We need to bing an extra function to the focusout event, to work around
      // a bug with 3rd part keyboards (Swype) not firing keyup events.
      console.log('Here we are.');
      this.$('input').on('focusout', this.toggleClear);
    },

    clearInput: function clearInput(event) {
      var elem = event.srcElement;
      $(elem).siblings('input').val('');
      elem.style.display = 'none';
    },

    login: function login() {
      var user = this.$('#email-input').val(),
          pass = this.$('#password-input').val();

      if(user === '' || pass === '') {
        alert('You need to enter the appropriate details to login!');
        return false;
      }

      doAct('login', {
        username: user,
        password: pass
      }, function(res) {
        localStorage.setItem('authData', JSON.stringify(res));
        window.app.navigate("accounts", {trigger: true, replace: true});
      }, function(err) {
        alert('Login failed; check details and try again.');
      });
    },

    toggleIconColor: function(event) {
      var elem = $(event.srcElement);
      var ssIcon = elem.siblings('.ss-icon:not(.clear-input)');
      var clearIcon = elem.siblings('.clear-input');

      if (ssIcon.css('color') === 'rgb(0, 0, 0)') {
        ssIcon.css('color', '#ccc');
        clearIcon.css('color', '#ccc');
      } else {
        ssIcon.css('color', '#000');

        // TODO: Find a way to make this more DRY.
        clearIcon.css('color', '#FF2752');
      }
    },

    render: function() {
      this.$el.html($('#login-page-template').html());

      // Animate the form in.
      setTimeout(function() {
        this.$('#login-content').css({
          '-webkit-transform': 'translateY(0)',
          'opacity': 1
        }); }, 500);

      console.log('rendered me');

      return this;
    }
  });

  var IntroPage = Backbone.View.extend({
    tagName: 'section',
    className: 'page',
    id: 'intro-page',

    titlebar: {
      title: 'Welcome!'
    },

    events: {

    },

    render: function() {
      this.$el.html('<p>Introduction page with brief overview of features and simple guide.</p>');
      return this;
    }
  });

  var AppRouter = Backbone.Router.extend({
    viewport: null,

    routes: {
      '': 'startup',
      'login': 'login',
      'accounts': 'accounts',
      'accounts/:id': 'singleAccount',
      'cases': 'cases',
      'cases/:id': 'singleCase',
      'campaigns': 'campaigns',
      'campaigns/:id': 'campaignDetail',
      'opportunities': 'opportunities',
      'opportunities/:id': 'opportunityDetail',
      'logout': 'logout'
    },

    initialize: function() {
      _.bindAll(this);
      this.viewport = new AppViewport();
    },

    startup: function startup() {
      console.log('startup');
      var authData = localStorage.getItem('authData');

      if (authData && !isSessionTimedOut()) {
        console.log('Skipping login...');
        window.app.navigate('accounts', {trigger: true, replace: true});
      } else {
        window.app.navigate('login', {trigger: true, replace: true});
      }
    },

    login: function() {
      this.viewport.setView(LoginPage);
    },

    accounts: function() {
      this.viewport.setView(ListPage, {
        id: 'accounts-page',
        collectionName: 'accounts',
        titleField: 'Name',
        titlebar: {
          title: 'Accounts'
        },
        customiseBorder: function customiseBorder(item) {
          return item.get('Rating');
        }
      });
    },

    singleAccount: function singleAccount(id) {
      this.viewport.setView(ListDetailPage, {
        titlebar: {
          title: 'Accounts'
        },
        isChild: true,
        id: 'account-detail-page',
        theId: id,
        templateId: 'account-tpl',
        collectionName: 'accounts',
        customiseEl: function customiseEl(el) {
          var that = this,
              width = $(window).width(),
              mapUrl = 'http://maps.googleapis.com/maps/api/staticmap?zoom=13&size=' + width + 'x' + Math.round(width * .67) + '&maptype=roadmap&sensor=false&center=';

          function getEscapedAddress() {
            var address = [
              that.model.get('BillingStreet'),
              that.model.get('BillingCity'),
              that.model.get('BillingState'),
              that.model.get('BillingCountry')
            ].join(', ');
            return address.replace(/\s/g, '+');
          }

          mapUrl += getEscapedAddress();

          // If we're on retina, upscale the image to keep quality perfect.
          mapUrl += window.devicePixelRatio > 1 ? '&scale=2' : '';

          // Insert the raw data...
          raw = '<table>';
          for (i = 1; i < Object.keys(this.model.attributes).length; i++) {
            raw += '<tr><td>' + Object.keys(this.model.attributes)[i] + '</td><td>' + this.model.attributes[Object.keys(this.model.attributes)[i]] + '</td></tr>';
          }
          raw += '</table>';
          el.find('.raw').html(raw);

          el.find('.account-head').css('background-image', 'url(' + mapUrl + ')');

          el.find('.account-head').one('tap', function openMap() {
            window.location = 'http://maps.google.com/maps?q=' + getEscapedAddress();
          });
        }
      });
    },

    opportunities: function opportunities() {
      this.viewport.setView(ListPage, {
        id: 'opportunities-page',
        collectionName: 'opportunities',
        titleField: 'Name',
        subtitleField: 'StageName',
        titlebar: {
          title: 'Opportunities'
        },
        customiseBorder: function customiseBorder(item) {
          var probability = item.get('Probability'),
              elem = $('<div class="opp-probability"></div>'),
              num = $('<div>' + probability + '</div>'),
              className;

          if (probability > 70) {
            className = 'high';
          } else if (probability > 40) {
            className = 'medium';
          } else if (probability > 0) {
            className = 'low';
          }
          elem.addClass(className);

          elem.append(num);
          elem.css('width', probability + '%');
          return elem[0];
        }
      });
    },

    opportunityDetail: function opportunityDetail(id) {
      this.viewport.setView(ListDetailPage, {
        titlebar: {
          title: 'Opportunities'
        },
        isChild: true,
        id: 'opportunity-detail-page',
        theId: id,
        templateId: 'opportunity-tpl',
        collectionName: 'opportunities',
        customiseEl: function customiseEl(el) {
          var that = this,
              probability = this.model.get('Probability'),
              probBar = el.find('#probability-bar'),
              probFigure = probBar.find('#probability-figure'),
              className, raw;

          if (probability > 70) {
            className = 'high';
          } else if (probability > 40) {
            className = 'medium';
          } else if (probability > 0) {
            className = 'low';
          }
          probBar.addClass(className);
          probBar.css('width', probability + '%');

          probFigure.html(probability + '% probable');

          // Insert the raw data...
          raw = '<table>';
          for (i = 1; i < Object.keys(this.model.attributes).length; i++) {
            raw += '<tr><td>' + Object.keys(this.model.attributes)[i] + '</td><td>' + this.model.attributes[Object.keys(this.model.attributes)[i]] + '</td></tr>';
          }
          raw += '</table>';
          el.find('.raw').html(raw);

          el.find('.info').one('tap', function() {
            window.app.navigate('accounts/' + that.model.get('AccountId'), {trigger: true});
          });
        }
      });
    },

    cases: function cases() {
      this.viewport.setView(ListPage, {
        id: 'cases-page',
        collectionName: 'cases',
        titleField: 'Subject',
        titlebar: {
          title: 'Cases'
        },
        customiseBorder: function customiseBorder(item) {
          var classString;

          classString = item.get('Priority');

          if (item.get('IsClosed')) {
            classString += ' true';
          }

          return classString;
        }
      });
    },

    singleCase: function singleCase(id) {
      this.viewport.setView(ListDetailPage, {
        titlebar: {
          title: 'Cases'
        },
        isChild: true,
        id: 'cases-detail-page',
        theId: id,
        templateId: 'cases-tpl',
        collectionName: 'cases',
        customiseEl: function customiseEl(el) {
          // Insert the raw data...
          raw = '<table>';
          for (i = 1; i < Object.keys(this.model.attributes).length; i++) {
            raw += '<tr><td>' + Object.keys(this.model.attributes)[i] + '</td><td>' + this.model.attributes[Object.keys(this.model.attributes)[i]] + '</td></tr>';
          }
          raw += '</table>';
          el.find('.raw').html(raw);
        }
      });
    },

    campaigns: function campaigns() {
      this.viewport.setView(ListPage, {
        id: 'campaigns-page',
        collectionName: 'campaigns',
        titleField: 'Name',
        subtitleField: 'Status',
        titlebar: {
          title: 'Campaigns'
        },
        customiseBorder: function customiseBorder(item) {
          var budget = item.get('BudgetedCost'),
              actual = item.get('ActualCost'),
              pct = (actual/budget) * 100,
              elem, pctElem, overBudget;

          overBudget = (pct > 100);
          pct = (pct > 100) ? ((pct - 100) > 100) ? 100 : pct - 100 : pct;

          if (actual) {
            elem = $('<div class="cost-bar"></div>');

            if (overBudget) {
              elem.addClass('overbudget');
            }

            pctElem = $('<div class="cost-actual" style="width:' + pct + '%;"></div>');
            elem.append(pctElem);
            return elem[0];
          }
          return false;
        }
      });
    },

    campaignDetail: function campaignDetail(id) {
      this.viewport.setView(ListDetailPage, {
        titlebar: {
          title: 'Campaigns'
        },
        isChild: true,
        id: 'campaign-detail-page',
        theId: id,
        templateId: 'campaign-tpl',
        collectionName: 'campaigns',
        customiseEl: function customiseEl(el) {
          // Insert the raw data...
          raw = '<table>';
          for (i = 1; i < Object.keys(this.model.attributes).length; i++) {
            raw += '<tr><td>' + Object.keys(this.model.attributes)[i] + '</td><td>' + this.model.attributes[Object.keys(this.model.attributes)[i]] + '</td></tr>';
          }
          raw += '</table>';
          el.find('.raw').html(raw);
        }
      });
    },

    logout: function logout() {
      var collection;

      localStorage.removeItem('authData');

      for (collection in collections) {
        collections[collection].length = 0;
      }

      window.app.navigate('login', {trigger: true});
    }
  });

  // The only global variable we introduce is the main application router class.
  // We don't just instanciate it now due to needing the DOM to be ready for
  // initialization etc.
  window.App = AppRouter;

  var Page = Backbone.View.extend({
    className: 'page',
    scroller: null,

    initialize: function initialize() {
      _.bindAll(this);

      // Giving a string collectionName is recommended, as it allows us to
      // properly reference links to individual items.
      if (!this.collection && this.options.collectionName) {
        this.collection = collections[this.options.collectionName] || undefined;
      }

      if (this.collection) {
        this.collection.on('reset', this.refreshRender);

        if (!this.collection.length) {
          this.collection.fetch();
        }
      }

      if (this.options.isChild) {
        this.isChild = true;
      }

      if (this.extraInit) {
        this.extraInit();
      }
    },

    refreshRender: function refreshRender() {
      var that = this;

      this.render();
      setTimeout(that.setupScroll, 100);
    },

    setupScroll: function setupScroll() {
      var that = this,
          el = $(this.$el.children()[0]),
          tallEnough = (el.height() > $(window).height() * .8);

      // TODO: Enable better management of iScrolls, to prevent possible memory
      // leaks etc.
      if (tallEnough) {
        that.scroller = new iScroll(that.id);
      }
    }
  });

  var ListPage = Page.extend({
    collection: null,

    options: {
      titleField: null,
      subtitleField: null,
      listClass: null,

      // Stub function, you should provide your own when wanting to use the
      // color bars on the left of the list.
      customiseBorder: function customiseBorder(item) {
        return false;
      }
    },

    render: function render() {
      var that = this,
          ul = $('<ul></ul>');

      this.collection.each(function(item) {
        ul.append(that.renderItem(item));
      });

      this.$el.html(ul);

      return this;
    },

    renderItem: function renderItem(item) {
      var that = this,
          li = $('<li></li>'),
          span = $('<span></span>'),
          customBorder = this.options.customiseBorder(item),
          id = item.get('Id');

      if (this.options.collectionName) {
        li.attr('data-link', id);
        li.on('tap', function viewDetail() {
          var link = that.options.collectionName + '/' + li.attr('data-link');

          function removeTouchStyle() {
            li.removeClass('touched');
          }

          li.addClass('touched');
          setTimeout(removeTouchStyle, 100);

          window.app.navigate(link, {trigger: true});
        });
        li.on('longTap', function touchStyle() {
          li.addClass('touched');
          $('body').one('touchend', function removeTouchStyle() {
            li.removeClass('touched');
          });
        });
      }

      li.append(span);
      span.append('<h2>' + item.get(this.options.titleField) + '</h2>');

      if (customBorder) {
        if (_.isString(customBorder)) {
          span.addClass(customBorder);
        }

        if (_.isElement(customBorder)) {
          span.prepend(customBorder);
        }
      }

      if (this.options.subtitleField) {
        span.append('<aside>' + item.get(this.options.subtitleField) + '</aside>');
      }

      return li;
    }
  });

  var ListDetailPage = Page.extend({

    extraInit: function extraInit() {
      if (this.options.templateId) {
        this.template = _.template($('#' + this.options.templateId).html());
      }
    },

    render: function render() {
      var el;

      // If there's no collection loaded yet, bail out... the refreshRender will
      // take care of us after the collection loads.
      if (!this.collection.length) {
        return this;
      }

      this.model = this.collection.where({ Id: this.options.theId })[0];
      el = $(this.template(this.model.toJSON()));

      if (this.options.customiseEl) this.options.customiseEl.call(this, el);

      this.$el.html(el);

      return this;
    }
  });
}());

// When the DOM is ready we initiate the app.
$fh.ready(function() {
  $fh.legacy.fh_timeout=60000;
  window.app = new window.App();

  // Setting the document root like this allows us to run our app from the
  // AppStudio Online IDE without hassle, with no side-effects elsewhere.
  Backbone.history.start({pushState: false, root: document.location.pathname});
});

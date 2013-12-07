Villages = new Meteor.Collection('villages');
// Home base
var lat =  -29.831114;
var longitude =  28.277982;


if (Meteor.isClient) {
  Template.map.rendered = function () {
    var tileUrl = 'http://a.tiles.mapbox.com/v3/mlmorg.gfnol46k/{z}/{x}/{y}.png';
    var iconUrl = 'http://a.tiles.mapbox.com/v3/marker/pin-{size}-{text}+{color}.png';

    function Riders () {
      var that = this;
      this.map = document.getElementById('map');
      this.summary = document.getElementById('summary');
      this.mapScreen = document.getElementById('map-screen');
      this.detailScreen = document.getElementById('detail-screen');
      this.backButton = document.getElementById('back-button');
      this.filters = document.querySelectorAll('.js-filter');

      this.leaflet = L.map(this.map);

      this.summary.addEventListener('click', this.showDetail.bind(this));
      this.backButton.addEventListener('click', this.showMap.bind(this));
      Array.prototype.forEach.call(this.filters, function (el) {
        el.addEventListener('click', that.filterChanged.bind(that));
      });

      L.tileLayer(tileUrl).addTo(this.leaflet);
      this.leaflet.setView([-29.609988, 28.233608], 8);

      var that = this;
      this.leaflet.on('click', function (e) {
        $(that.summary).removeClass('show');
        that.lastMarker.defaultIcon();
        Session.set('current-summary', null);
      });
    }

    Riders.prototype.addTown = function (latlng, options, id) {
      var marker = this.addMarker(latlng, options);
      marker.id = id;
      var that = this;
  
      marker.defaultIcon = function () {
        this.setIcon(that.createIcon(options));
      };
  
      marker.on('click', function () {
        if (that.lastMarker) {
          that.lastMarker.defaultIcon();
        }
        marker.setIcon(that.createIcon(L.Util.extend({ size: 'l' }, options)));
        Session.set('current-summary', this.id);
        that.showSummary();
        that.lastMarker = marker;
      });
    };

    Riders.prototype.filterChanged = function (e) {
      // Was this filter previously selected?
      var selected = !!e.currentTarget.className.match(/selected/);

      // Unselect all filters
      Array.prototype.forEach.call(this.filters, function (el) {
        el.className = el.className.replace(/selected/, '');
      });

      // Select current filter if it was previously un-selected
      if (!selected) {
        e.currentTarget.className += ' selected';
      }
    };

    Riders.prototype.showSummary = function () {
      if (!this.summary.className.match(/show/)) {
        this.summary.className += ' show';
      }
    };

    Riders.prototype.showDetail = function () {
      this.detailScreen.className = this.detailScreen.className.replace('out-right', '');
      this.mapScreen.className += ' out-left';
    };

    Riders.prototype.showMap = function () {
      this.detailScreen.className += ' out-right';
      this.mapScreen.className = this.mapScreen.className.replace('out-left', '');
    };

    Riders.prototype.addMarker = function (latlng, options) {
      options = options || {};
      options.icon = options.icon || this.createIcon(options);

      var marker = L.marker(latlng, options);

      marker.addTo(this.leaflet);
      return marker;
    };

    Riders.prototype.createIcon = function (options) {
      options = L.Util.extend({
        text: 'village',
        color: '#7ec9b1',
        size: 'm',
        iconSize: [30, 70],
        iconAnchor: [15, 35]
      }, options);
  
      if (options.size === 'l') {
        options.iconSize = [35, 90];
        options.iconAnchor = [17, 45];
      }

      options.iconUrl = options.iconUrl || L.Util.template(iconUrl, {
        text: options.text,
        size: options.size,
        color: options.color.replace('#', '')
      });

      return L.icon(options);
    };

    var map = new Riders();

    map.addTown([lat, longitude], { text: "hospital", color: "#8e44ad" }, 'homebase');
    // put villages on map
    Deps.autorun(function () {
      Villages.find().forEach(function (vil) {
        map.addTown([vil.latitude, vil.longitude], {color:vil.urgency_color}, vil._id);
      });
    });
  };

  Template.summaryDetails.helpers({
    townname: function () {
      if (Session.get('current-summary') == 'homebase')
        return "Home base";
      if (!Session.get('current-summary') || !Villages.findOne(Session.get('current-summary'))) {
        return '';
      }
      var vil = Villages.findOne(Session.get('current-summary'));
      return vil.Townname;
    },
    distance: function () {
      if (Session.get('current-summary') == 'homebase')
        return 0;
      if (!Session.get('current-summary') || !Villages.findOne(Session.get('current-summary'))) {
        return '';
      }
      var vil = Villages.findOne(Session.get('current-summary'));
      return calc_distance(longitude, lat, vil.longitude, vil.latitude).toFixed(1);
    },
    urgent: function () {
      if (!Session.get('current-summary') || !Villages.findOne(Session.get('current-summary'))) {
        return 0;
      }

      var vil = Villages.findOne(Session.get('current-summary'));
      return calculate_urgent(new Date, vil);
    }
  });
}

Meteor.methods( {
  calc_path: function(type) {

    //sort by type (medicine, pregnancy, baby ...)
    var sort_order = {};
    sort_order[type] = -1;
    var sorted_villages = Villages.find({}, {sort: sort_order}).fetch();

    var max_distance = 100;
    var total_distance = 0;
    var visit_villages = [];

    //set start point as home base
    var past_lat = -29.308319;
    var past_long = 27.491600;

    /*
     * find optimal path. right now, it assumes you can only go to villages
     * where the total path is < 100 km
     */

    //make sure that we are staying within max distance bounds
    var i = 0;
    while ((total_distance < max_distance) && i < sorted_villages.length) {

      //calculate the distance between this village and the past village
      var distance = calc_distance(past_lat, past_long, sorted_villages[i].latitude, sorted_villages[i].longitude);

      //if this village is too far away, go down to the next urgent village
      if (distance+total_distance > max_distance)
        break;

      //if we can go there, store the village, set it as prev lat long
      visit_villages.push(sorted_villages[i]);
      past_lat = sorted_villages[i].latitude;
      past_long = sorted_villages[i].longitude;
      i++;
    }
  }

});

if (Meteor.isServer) {
  Meteor.startup(function () {

    if (!Villages.find().count())
      _.each(Data, function (x) {
        Villages.insert(x);
      });
  });
}

// from http://www.movable-type.co.uk/scripts/latlong.html and https://github.com/boundsj/meeteor_web
function calc_distance (lat1, lon1, lat2, lon2) { 
      var dLat = (lat2 - lat1) * Math.PI / 180,
      dLon = (lon2 - lon1) * Math.PI / 180,
      a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(lat1 * Math.PI / 180)
        * Math.cos(lat2 * Math.PI / 180) * Math.pow(Math.sin(dLon / 2), 2),
      c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return (6371 * c) ; // returns kilometers
}

function calculate_urgent(date, village) {
    var urgent_care = 0;
    for (var i = 0; i<village.pregnant.length; i++){
      var timediff = (village.pregnant[i] - date);
      var daysdiff = Math.ceil(timediff / (1000 * 3600 * 24));

      if(daysdiff< 14) {
        urgent_care = urgent_care + 1;
      }
    }

    for (var i = 0; i<village.hiv.length; i++){
      var timediff = (village.pregnant[i] - date);
      var daysdiff = Math.ceil(timediff / (1000 * 3600 * 24));

      if(daysdiff< 14) {
        urgent_care = urgent_care + 1;
      }
    }

    return urgent_care;
}
function calculate_color(date,village) {
  var urgent_care = calculate_urgent(date, village);

  if (urgent_care > 2) {
    return "#e74c3c";
  }
  else if (urgent_care > 1) {
    return "#f1c40f";
  }

  return "#2ecc71";
}

Villages = new Meteor.Collection('villages');
Paths = new Meteor.Collection('paths');
SelectedVillages = new Meteor.Collection("selectedvillages");
SelectedPaths = new Meteor.Collection("selectedpaths");

// Home base
var lat =  -29.831114;
var longitude =  28.277982;
var initedMap = false;
var idToMarker = {};


if (Meteor.isClient) {
  Template.map.rendered = function () {
    if (initedMap)
      return;
    initedMap = true;
    var tileUrl = 'http://a.tiles.mapbox.com/v3/mlmorg.gfnol46k/{z}/{x}/{y}.png';
    var iconUrl = 'http://a.tiles.mapbox.com/v3/marker/pin-{size}-{text}+{color}.png';

    Session.set('details-shown', false);

    function Riders () {
      var that = this;
      this.map = document.getElementById('map');
      this.summary = document.getElementById('summary');
      this.mapScreen = document.getElementById('map-screen');
      this.detailScreen = document.getElementById('detail-screen');
      this.backButton = document.getElementById('back-button');
      this.filters = document.querySelectorAll('.js-filter');
      this.diseaseModal = document.getElementById('disease-modal');

      this.leaflet = L.map(this.map);

      this.summary.addEventListener('click', this.showDetail.bind(this));
      this.backButton.addEventListener('click', this.showMap.bind(this));
      Array.prototype.forEach.call(this.filters, function (el) {
        el.addEventListener('click', that.filterChanged.bind(that));
      });

      L.tileLayer(tileUrl).addTo(this.leaflet);
      this.leaflet.setView([-29.609988, 28.233608], 8);
      this.leaflet.doubleClickZoom = true;

      //draw path
      var draw_paths = get_paths("default");
      for (var i = 0; i < draw_paths.length; i++) {
        var draw_array = draw_paths[i];
        var polyline = L.polyline(draw_array, {color: "red", weight: "2"});
        polyline.addTo(this.leaflet);
      }
      
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
      return marker;
    };

    Riders.prototype.filterChanged = function (e) {
      // Was this filter previously selected?
      var selected = !!e.currentTarget.className.match(/selected/);

      // Unselect all filters
      Array.prototype.forEach.call(this.filters, function (el) {
        el.className = el.className.replace(/selected/, '');
      });

      var type = e.currentTarget.getAttribute('data-type');

      // Select current filter if it was previously un-selected
      if (!selected) {
        e.currentTarget.className += ' selected';
      } else {
        type = null;
      }
      Session.set('filter', type);
    };

    Riders.prototype.showSummary = function () {
      if (!this.summary.className.match(/show/)) {
        this.summary.className += ' show';
      }
    };

    Riders.prototype.showDetail = function () {
      //this.detailScreen.className = this.detailScreen.className.replace('out-right', '');
      this.mapScreen.className += ' out-left';
      Session.set('details-shown', true);
    };

    Riders.prototype.showMap = function () {
      //this.detailScreen.className += ' out-right';
      this.mapScreen.className = this.mapScreen.className.replace('out-left', '');
      Session.set('details-shown', false);
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
    MMM = map;

    map.addTown([lat, longitude], { text: "hospital", color: "#8e44ad" }, 'homebase');
    // put villages on map
    Deps.autorun(function () {
      var filter = {};
      var revFilter = {};
      if (Session.get('filter')) {
        filter[Session.get('filter')] = { $not: { $size: 0 } };
        revFilter[Session.get('filter')] = { $size: 0 };
      }
      Villages.find(revFilter).forEach(function (vil) {
        if (_.has(idToMarker, vil._id)) {
          map.leaflet.removeLayer(idToMarker[vil._id]);
          delete idToMarker[vil._id];
        }
      });

      Villages.find(filter).forEach(function (vil) {
        if (_.has(idToMarker, vil._id))
          return;
        var marker = map.addTown([vil.latitude, vil.longitude], {color:vil.urgency_color}, vil._id);
        idToMarker[vil._id] = marker;
      });
    });
  };

  var detailsHelpers = {
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
    },
    population: function () {
      if (!Session.get('current-summary') || !Villages.findOne(Session.get('current-summary'))) {
        return 33;
      }

      var vil = Villages.findOne(Session.get('current-summary'));
      return vil.male + vil.female;
    },
    male: function () {
      if (!Session.get('current-summary') || !Villages.findOne(Session.get('current-summary'))) {
        return 16;
      }

      var vil = Villages.findOne(Session.get('current-summary'));
      return vil.male;
    },
    female: function () {
      if (!Session.get('current-summary') || !Villages.findOne(Session.get('current-summary'))) {
        return 17;
      }

      var vil = Villages.findOne(Session.get('current-summary'));
      return vil.female;
    },
    community: function () {
      if (!Session.get('current-summary') || !Villages.findOne(Session.get('current-summary'))) {
        return "PHC";
      }

      var vil = Villages.findOne(Session.get('current-summary'));
      return vil.community;
    },
    needs: function () {
      return [{ id: "pregnancy", label: "Pregnant Women" },
              { id: "baby", label: "Immunizations Needed" },
              { id: "blood", label: "Blood Tests Needed" },
              { id: "medicine", label: "General Medicine Help" },
              { id: "hiv", label: "HIV+"}];
    },
    'urgent-css': function () {
      if (!Session.get('current-summary') || !Villages.findOne(Session.get('current-summary'))) {
        return "";
      }

      var vil = Villages.findOne(Session.get('current-summary'));
      return calculate_urgent(new Date, vil) > 0 ? 'text-urgent' : '';
    },

    'class-show-details': function () {
      return Session.get('details-shown') ? '' : 'out-right';
    }
  };

  Template.summaryDetails.helpers(detailsHelpers);
  Template.detailScreen.helpers(detailsHelpers);

  Template.detailScreen.events({
    'blur input': function (e) {
      if (!Session.get('current-summary') || !Villages.findOne(Session.get('current-summary'))) {
        return;
      }

      var vil = Session.get('current-summary');
      var val = $(e.target).val();
      var id = $(e.target).attr('id');
      var setter = {};
      setter[id] = parseInt(val);
      Villages.update(vil, { $set: setter });
    }
  });

  Template.townInfo.amount = function () {
    var t = this.id;
    if (!Session.get('current-summary') || !Villages.findOne(Session.get('current-summary'))) {
      return 0;
    }
    var vil = Villages.findOne(Session.get('current-summary'));
    if (_.isArray(vil[t]))
      return vil[t].length;
    return vil[t];
  };

  Template.townInfo.events({
    'click button.add-disease': function () {
      var id = this.id;
      // VERY HACKY GLOBAL HACK
      EDITING_DATE_ID = id;
      $('#disease-modal').removeClass('hide');
    }
  });

  Template.modal.events({
    'click button.add-date': function () {
      var date = new Date($('input[type=date]').val());
      if (!Session.get('current-summary') || !Villages.findOne(Session.get('current-summary'))) {
        return 
      }
      var vil = Session.get('current-summary');
      var pusher = {};
      pusher[EDITING_DATE_ID] = date;
      Villages.update(vil, {$push: pusher});
      return false;
    },
    'click button.close': function () {
      $('#disease-modal').addClass("hide");
    }
  });
}


if (Meteor.isServer) {
  Meteor.startup(function () {

    if (!Villages.find().count())
      _.each(Data, function (x) {
        Villages.insert(x);
      });


    //generate paths between all villages
    /*if (!Paths.find().count()) {
      //generate list of paths between villages
      var vils = Villages.find().fetch();
      
      for (var i = 0; i < vils.length; i++) {
        var vil1 = vils[i];
        for( var j = i+1; j<vils.length; j++) {
          var vil2 = vils[j];
          var newpath = build_path(vil1, vil2);
          Paths.insert( {
            from: vils[i]._id,
            to: vils[j]._id,
            path: newpath
          });
          
        }
      }
    }*/



  });
}

//calculates path between two villages
function build_path(vil1, vil2) {
  var pt1 = [vil1.latitude, vil1.longitude];
  var pt2 = [vil2.latitude, vil2.longitude];

  var path_points = 10;
  var path = [pt1];
  var inc_lat = (pt2[0]-pt1[0])/(path_points);
  var inc_long = (pt2[1]-pt1[1])/(path_points);

  //Math.random()/20

  var last_loc = pt1;
  for (var i = 1; i < path_points; i++) {
    var sign1 = 0;
    var sign2 = 0;

    if( Math.random > 0.5) 
      sign1 = 1;
    else
      sign1 = -1

    if( Math.random > 0.5) 
      sign2 = 1;
    else
      sign2 = -1


    var next_point = [pt1[0] + inc_lat*i + Math.random()/40*sign1, pt1[1] + inc_long*i + Math.random()/40*sign2];
    path.push(next_point);
    last_loc = next_point;
  }

  path.push(pt2);
  return path;
}

//generates the paths given type
function get_paths(type) {
  if (type=="default") {
    var home = {latitude: -29.831114, longitude: 28.277982};

    //basura
    var v1 = { latitude: -29.690116150362357, longitude: 28.390072692273343};

    //sambuya
    var v2 = { latitude: -29.62187506287539, longitude: 28.59281502637935};

    var path1 = build_path(home, v1);
    var path2 = build_path(v1, v2);
    var path3 = build_path(v2, home);

    //return [path1];
    return [path1, path2, path3];
  }
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
    for (var i = 0; i<village.pregnancy.length; i++){
      var timediff = (village.pregnancy[i] - date);
      var daysdiff = Math.ceil(timediff / (1000 * 3600 * 24));

      if(daysdiff< 14) {
        urgent_care = urgent_care + 1;
      }
    }

    for (var i = 0; i<village.hiv.length; i++){
      var timediff = (village.hiv[i] - date);
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


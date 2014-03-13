(function(exports) {
  var PetaCaleg = exports.PetaCaleg = {
    version: "0.0.0"
  };

  // utility functions
  var utils = PetaCaleg.utils = {};

  /*
   * merge two or more objects' keys into the first object
   */
  utils.extend = function extend(obj, other) {
    [].slice.call(arguments, 1).forEach(function(o) {
      if (!o) return;
      for (var key in o) {
        obj[key] = o[key];
      }
    });
    return obj;
  };

  /*
   * copy keys from one object to another
   */
  utils.copy = function copy(source, dest, keys) {
    if (!dest) dest = {};
    if (!keys) keys = Object.keys(source);
    keys.forEach(function(key) {
      dest[key] = source[key];
    });
    return dest;
  };

  utils.first = function first(list, test) {
    if (typeof test !== "function") {
      var id = test;
      test = function(d) {
        return d.id == id;
      };
    }
    return list.filter(test)[0];
  };

  // Class constructor
  PetaCaleg.Class = function(parent, proto) {
    if (arguments.length === 1) {
      proto = parent;
      parent = null;
    }
    var klass = function() {
      if (typeof klass.prototype.initialize === "function") {
        klass.prototype.initialize.apply(this, arguments);
      }
    };
    klass.prototype = parent
      ? utils.extend(new parent(), proto)
      : proto;
    klass.extend = function(methods) {
      return new maps.Class(klass, methods);
    };
    if (proto && typeof proto.defaults === "object") {
      klass.defaults = utils.extend({}, parent ? parent.defaults : null, proto.defaults);
    }
    return klass;
  };

  PetaCaleg.App = new PetaCaleg.Class({
    defaults: {
      routes: [
      ]
    },

    initialize: function(options) {
      this.options = utils.extend({}, PetaCaleg.App.defaults, options);

      this.api = this.options.api;
      this.map = this.options.map;
      this.content = d3.select(this.options.content);
      this.breadcrumb = d3.select(this.options.breadcrumb);

      this.context = {};

      this.resolver = new PetaCaleg.Resolver();
      if (this.options.routes) {
        var that = this,
            resolved = this.resolved.bind(this);
        this.options.routes.forEach(function(url) {
          that.resolver.add(url, resolved);
        });
      }

      this.dispatch = d3.dispatch("context", "route", "404");
      d3.rebind(this, this.dispatch, "on");
    },

    init: function() {
      window.addEventListener("hashchange", this._route.bind(this));
      this._route();
    },

    _route: function() {
      var url = location.hash.substr(1);
      this.resolver.resolve(url);
    },

    getContext: function() {
      return utils.copy(this.context, {});
    },

    setContext: function(context, callback) {
      this.context = utils.copy(context, {});
      this.dispatch.context(this.context);
      return this.update(callback);
    },

    resolved: function(request) {
      console.info("resolved:", request.url, request.data);
      return this.setContext(request.data);
    },

    update: function(callback) {
      var context = this.getContext(),
          that = this,
          breadcrumbs = [],
          done = function(error) {
            that.setBreadcrumbs(breadcrumbs);
          };

      if (context.lembaga) {
        breadcrumbs.push({
          text: context.lembaga,
          context: utils.copy(context, {}, ["lembaga"])
        });

        switch (context.lembaga) {
          case "DPD":
            this.getProvinces(context, function(error, provinces) {
              console.log("provinces:", provinces);

              if (context.provinsi) {
                var province = utils.first(provinces, context.provinsi);

                if (province) {
                  breadcrumbs.push({
                    text: province.nama,
                    context: utils.copy(context, {}, ["lembaga", "provinsi"])
                  });

                  that.getCandidates(context, function(error, candidates) {
                    that.listCandidates(candidates, context);

                    if (context.caleg) {
                      var candidate = utils.first(candidates, context.caleg);

                      if (candidate) {
                        breadcrumbs.push({
                          text: candidate.nama,
                          context: utils.copy(context, {}, ["lembaga", "provinsi", "caleg"])
                        });
                        that.selectCandidate(candidate);
                        return done();
                      } else {
                        console.warn("no such caleg:", context.caleg, "in", candidates);
                        return done("no such caleg: " + context.caleg);
                      }
                    }
                    return done();
                  });
                } else {
                  console.warn("no such province:", context.provinsi, "in", provinces);
                  return done("no such province: " + context.provinsi);
                }
              } else {
                that.listProvinces(provinces, context);
                return done();
              }
            });
        }
      }
    },

    setBreadcrumbs: function(breadcrumbs) {
      var bc = this.breadcrumb.selectAll("li")
        .data(breadcrumbs);

      bc.exit().remove();
      bc.enter().append("li")
        .append("a");

      var that = this;
      bc.classed("active", function(d, i) {
          return i === breadcrumbs.length - 1;
        })
        .select("a")
          .text(function(d) {
            return d.text;
          })
          .attr("href", function(d) {
            return "#" + that.resolver.getUrlForData(d.context);
          });
    },

    getProvinces: function(context, callback) {
      var params = utils.copy(context, {}, ["lembaga"]);
      return this.api.get("candidate/api/provinsi", params, function(error, res) {
        return error
          ? callback(error)
          : callback(null, res.results.provinsi);
      });
    },

    listProvinces: function(provinces, context) {
      this.content.html("");

      var href = (function(d) {
        return "#" + this.resolver.getUrlForData({
          lembaga: context.lembaga,
          provinsi: d.id
        });
      }).bind(this);

      var title = this.content.append("h3")
            .text("Provinsi"),
          list = this.content.append("ul")
            .attr("class", "provinsi media-list"),
          items = list.selectAll("li")
            .data(provinces)
            .enter()
            .append("li")
              .attr("class", "provinsi media"),
          icon = items.append("a")
            .attr("class", "pull-left")
            .append("svg")
              .attr("class", "media-object"),
          head = items.append("div")
            .attr("class", "media-header")
            .append("h4")
              .append("a")
                .text(function(d) {
                  return d.nama;
                })
                .attr("href", href),
          body = items.append("div")
            .attr("class", "media-body");
    },

    getCandidates: function(context, callback) {
      var params = utils.copy(context, {}, [
        "lembaga",
        "provinsi",
        "dapil",
        "partai"
      ]);
      return this.api.get("candidate/api/caleg", params, function(error, res) {
        return error
          ? callback(error)
          : callback(null, res.results.caleg);
      });
    },

    listCandidates: function(candidates, context) {
      // FIXME we shouldn't have to clear the whole thing out
      this.content.html("");

      var href = (function(d) {
        return "#" + this.resolver.getUrlForData({
          lembaga:  context.lembaga,
          provinsi: context.provinsi,
          dapil:    context.dapil,
          partai:   context.partai,
          caleg:    d.id
        });
      }).bind(this);

      var title = this.content.append("h3")
            .text("Caleg"),
          list = this.content.append("ul")
            .attr("class", "caleg media-list"),
          items = list.selectAll("li")
            .data(candidates)
            .enter()
            .append("li")
              .attr("class", "caleg media"),
          icon = items.append("a")
            .attr("class", "pull-left")
            .append("img")
              .attr("class", "media-object photo")
              .attr("src", function(d) {
                return d.foto_url;
              }),
          head = items.append("div")
            .attr("class", "media-header")
            .append("h4")
              .append("a")
                .text(function(d) {
                  return d.nama;
                })
                .attr("href", href),
          body = items.append("div")
            .attr("class", "media-body")
            .text("TODO description here");
    },

    selectCandidate: function(candidate) {
      this.content.selectAll("li.caleg")
        .classed("active", function(d) {
          return d.id == candidate.id;
        });
    }

  });

  PetaCaleg.Resolver = new PetaCaleg.Class({
    initialize: function() {
      this.routes = [];
      this.keyPattern = /{(\w+)}/g;
    },

    add: function(url, callback, context) {
      var route = this.parseUrl(url);
      if (route) {
        route.callback = callback.bind(context || this);
        this.routes.push(route);
        return route;
      }
    },

    parseUrl: function(url) {
      var route = {
        url: url,
        keys: []
      };

      route.pattern = new RegExp("^" + url.replace(this.keyPattern, function(_, key) {
        route.keys.push(key);
        return "([^/]+)";
      }) + "$");
      return route;
    },

    resolve: function(url) {
      var bits = url.split("?", 2),
          url = bits[0],
          query = bits[1]
            ? qs.parse(bits[1])
            : {};
      for (var i = 0, len = this.routes.length; i < len; i++) {
        var route = this.routes[i],
            match = url.match(route.pattern);
        if (match) {
          var data = {};
          for (var i = 1; i < match.length; i++) {
            var key = route.keys[i - 1];
            data[key] = match[i];
          }
          var req = {
            url: url,
            data: data,
            query: query
          };
          if (route.callback) {
            route.callback(req);
          }
          return req;
        }
      }
      return null;
    },

    getUrlForData: function(data, keys) {
      if (!keys) {
        keys = Object.keys(data)
          .filter(function(key) {
            return data[key];
          });
      }
      keys.sort(d3.ascending);
      var str = String(keys);
      for (var i = 0, len = this.routes.length; i < len; i++) {
        var route = this.routes[i];
        if (route.keys.length === keys.length) {
          var sorted = route.keys.slice();
          sorted.sort(d3.ascending);
          if (String(sorted) == str) {
            return route.url.replace(this.keyPattern, function(_, key) {
              return data[key];
            });
          }
        }
      }
      return null;
    }
  });

  PetaCaleg.API = new PetaCaleg.Class({
    defaults: {
      key: "you must provide a key",
      baseUrl: "http://api.pemiluapi.org/",
      cache: true
    },

    initialize: function(options) {
      this.options = utils.extend({}, PetaCaleg.API.defaults, options);
      if (this.options.cache) {
        this._cache = {};
      }
    },

    get: function(uri, params, callback) {
      if (arguments.length === 2) {
        callback = params;
        params = {};
      }
      params.apiKey = this.options.key;
      var url = this.options.baseUrl + uri;
      if (params) {
        url += "?" + qs.format(params);
      }
      if (this._cache && this._cache[url]) {
        return callback(null, this._cache[url]);
      }
      var that = this;
      return this._req = d3.json(url, function(error, res) {
        if (error) return callback(error);
        if (that._cache) that._cache[url] = res.data || res;
        last = null;
        that._req = null;
        return callback(null, res.data || res);
      });
    },

    abort: function() {
      if (this._req) {
        var req = this._req;
        req.abort();
        this._req = null;
        return req;
      }
    },

    getOnly: function(uri, params, callback) {
      this.abort();
      return this.get(uri, params, callback);
    }
  });

  if (typeof google === "object" && google.maps) {

    // technique lifted from:
    // <http://www.portlandwebworks.com/blog/extending-googlemapsmap-object>
    google.maps.Map = (function(constructor) {
      var f = function() {
        if (!arguments.length) return;
        constructor.apply(this, arguments);
      };
      f.prototype = constructor.prototype;
      return f;
    })(google.maps.Map);

    var bounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(-11.0, 95.0),
      new google.maps.LatLng(6.07, 141.01)
    );

    PetaCaleg.Map = new PetaCaleg.Class(google.maps.Map, {
      defaults: {
        center: bounds.getCenter(),
        zoom: 4,
        minZoom: 3,
        maxZoom: 10,
        bounds: bounds,
        scrollwheel: false,
        disableDefaultUI: true,
        featureStyles: {
          off: {
            fillColor: "#fff",
            fillOpacity: 1,
            strokeColor: "#000",
            strokeWeight: .5,
            strokeOpacity: 1
          },
          offHover: {
            fillColor: "#fee",
            fillOpacity: 1,
            strokeColor: "#000",
            strokeWeight: .5,
            strokeOpacity: 1
          },
          on: {
            fillColor: "#f33",
            fillOpacity: 1,
            strokeColor: "#000",
            strokeWeight: .5,
            strokeOpacity: 1
          },
          onHover: {
            fillColor: "#f33",
            fillOpacity: 1,
            strokeColor: "#000",
            strokeWeight: .5,
            strokeOpacity: 1
          }
        }
      },

      initialize: function(options) {
        options = utils.extend({}, PetaCaleg.Map.defaults, options);
        google.maps.Map.call(this, document.querySelector(options.root), options);

        this.zoomControl = new PetaCaleg.Map.ZoomControl();
        this.zoomControl.setMap(this);

        if (options.bounds) {
          this.fitBounds(options.bounds);
        }

        var basic = PetaCaleg.Map.BasicMapType;
        this.mapTypes.set(basic.name, basic);
        this.setMapTypeId(basic.name);

        this.featureStyles = options.featureStyles;
      },

      setDisplayFeatures: function(features) {
        // copy the id down to the properties, because this is the part that
        // gets passed down to GeoJSON layers
        features.forEach(function(feature) {
          feature.properties.id = feature.id;
        });

        // remove the old layers
        if (this.displayLayers) {
          var layers = this.displayLayers;
          while (layers.length) {
            var layer = layers.shift();
            layer.setMap(null);
          }
        }

        var layer = new GeoJSON({
          type: "FeatureCollection",
          features: features
        }, this.featureStyles.off);

        this.displayLayers = this.addLayer(layer);
      },

      addLayer: function(layer) {
        var added = [];
        if (Array.isArray(layer)) {
          layer.forEach(function(d) {
            added = added.concat(this.addLayers(d));
          });
        } else {
          layer.setMap(this);
          this.addLayerListeners(layer);
          added.push(layers);
        }
        return added;
      },

      addLayerListeners: function(layer) {
        var that = this,
            addListener = google.maps.event.addListener;
        addListener(layer, "mouseover", function() {
          this.hover = true;
          that.updateLayerStyle(this);
        });
        addListener(layer, "click", function() {
          that.selectFeatureById(this.geojsonProperties.id);
        });
        addListener(layer, "mouseout", function() {
          this.hover = false;
          that.updateLayerStyle(this);
        });
      },

      selectFeature: function(feature) {
        return this.selectFeatureById(feature.id);
      },

      selectFeatureById: function(id) {
        var selected = [],
            that = this;
        this.displayLayers.forEach(function(layer) {
          if (layer.geojsonProperties.id == id) {
            layer.selected = true;
            selected.push(layer);
          } else {
            layer.selected = false;
          }
          that.updateLayerStyle(layer);
        });
        return selected;
      },

      updateLayerStyle: function(layer) {
        var key = layer.selected ? "on" : "off";
        if (layer.hover) key += "Hover";
        return layer.setOptions(this.featureStyles[key]);
      }
    });

    PetaCaleg.Map.BasicMapType = new google.maps.StyledMapType([
      {
        "featureType": "landscape",
        "stylers": [{"visibility": "off"}]
      },
      {
        "featureType": "poi",
        "stylers": [{"visibility": "off"}]
      },
      {
        "featureType": "administrative",
        "elementType": "labels",
        "stylers": [{"visibility": "off"}]
      },
      {
        "featureType": "landscape",
        "stylers": [{"visibility": "off"}]
      },
      {
        "featureType": "road",
        "stylers": [{"visibility": "off"}]
      },
      {
        "featureType": "water",
        "elementType": "labels",
        "stylers": [{"visibility": "off"}]
      }
    ], {
      name: "Basic"
    });

    PetaCaleg.Map.ZoomControl = new PetaCaleg.Class({
      defaults: {
        position: google.maps.ControlPosition.TOP_LEFT
      },

      initialize: function(options) {
        this.options = utils.extend({}, PetaCaleg.Map.ZoomControl.defaults, options);

        this.div = document.createElement("div");
        this.div.className = "zoom-control";
        this.div.index = 1;

        var that = this;
        d3.select(this.div)
          .selectAll("button")
          .data([
            {label: "+", delta: 1, dir: "in"},
            {label: "-", delta: -1, dir: "out"},
          ])
          .enter()
          .append("button")
            .attr("class", function(d) {
              return [d.dir, "btn"].join(" ");
            })
            .on("click", function(d) {
              if (!that.map) return;
              that.map.setZoom(that.map.getZoom() + d.delta);
            });
      },

      setMap: function(map) {
        this.map = map;
        this.map.controls[this.options.position].push(this.div);
      }
    });
  }

})(this);

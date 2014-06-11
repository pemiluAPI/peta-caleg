(function(exports) {

  var PetaCaleg = exports.PetaCaleg = {
    version: "1.0.0"
  };

  // utility functions
  var utils = PetaCaleg.utils = {};

  // monkey patch queue() to support progress events
  var _queue = exports.queue,
      queue = function() {
        var q = _queue(),
            defer = q.defer,
            dispatch = d3.dispatch("progress"),
            reqs = [],
            loaded = 0;

        q.defer = function() {
          var args = [].slice.call(arguments);
          return defer(function(callback) {
            var fn = args.shift(),
                req;
            args.push(function() {
              if (req) {
                req.loaded = req.total;
                update();
              }
              callback.apply(this, arguments);
            });

            req = fn.apply(this, args);
            if (!req) return;

            req.on("progress", function() {
              var e = d3.event;
              if (e.lengthComputable) {
                req.total = e.total;
                req.loaded = e.loaded;
                update();
              }
            });

            req.on("load.progress", function() {
              req.loaded = req.total;
              loaded++;
              // console.log("loaded", loaded, "of", reqs.length);
              update();
            });

            req.loaded = 0;
            req.total = 1024 * 1024; // XXX this is not quite right
            reqs.push(req);
            update();
          });
        };

        q.empty = function() {
          return reqs.length === 0;
        };

        function progress() {
          var req = this;
          update();
        }

        function finished(req) {
          req.loaded = req.total;
          update();
        }

        function update() {
          var total = 0,
              loaded = 0;
          reqs.forEach(function(req) {
            total += req.total;
            loaded += req.loaded;
          });
          // console.log("loaded:\t", loaded, "total:\t", total);
          dispatch.progress({
            total: total,
            loaded: loaded,
            progress: total > 0
              ? loaded / total
              : 0,
            requests: reqs
          });
        }

        return d3.rebind(q, dispatch, "on");
      };

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
      if (source.hasOwnProperty(key)) {
        dest[key] = source[key];
      }
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

  utils.classify = function(selection, prefix, value) {
    selection.attr("class", function() {
      var klass = [].slice.call(this.classList)
        .filter(function(c) {
          return c.indexOf(prefix) !== 0;
        });
      klass.push(prefix + value);
      return klass.join(" ");
    });
  };

  utils.diff = function(a, b) {
    var diff = [];
    for (var k in a) {
      if (a[k] != b[k]) {
        // console.log("diff(" + k + "):", [a[k], b[k]]);
        diff.push({
          source: "a",
          key: k,
          value: a[k]
        });
      }
    }
    for (var k in b) {
      if (!a.hasOwnProperty(k)) {
        // console.log("diff(" + k + "):", [a[k], b[k]]);
        diff.push({
          source: "b",
          key: k,
          value: b[k]
        });
      }
    }
    return diff;
  };

  utils.autoClick = function(selection) {
    selection
      .classed("auto-click", true)
      .on("click.auto", click, true);

    function click() {
      var e = d3.event;
      if (e.target.nodeName === "A" || e.target.parentNode.nodeName === "A") return;
      var a = d3.select(this)
        .select("a")
          .node();
      if (a) {
        a.click();
        try {
          e.preventDefault();
          e.stopImmediatePropagation();
        } catch (err) {
        }
        return false;
      }
    }
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
    if (proto && typeof proto.statics === "object") {
      utils.extend(klass, proto.statics);
    }
    return klass;
  };

  PetaCaleg.App = new PetaCaleg.Class({
    defaults: {
      collapseSingleDistricts: false,
      routes: []
    },

    statics: {
      CALEG_FIELDS: {
        "tempat_lahir": {name: "Tempat dan Tanggal Lahir", key: function getTTL(d) {
          return [prettyTTL(d), age(d)]
            .filter(notEmpty)
            .join(" ");
        }},
        "jenis_kelamin": {name: "Jenis Kelamin", key: function getGender(d) {
          return jenisMap[d.jenis_kelamin];
        }},
        "status_perkawinan": {name: "Status Perkawinan", key: function getMaritalStatus(d) {
          return d.status_perkawinan;
        }},
        "agama": {name: "Agama", key: function getReligion(d) {
          return d.agama;
        }},
        "tempat_tinggal": {name: "Tempat Tinggal", key: function getResidence(d) {
          return [
                "provinsi",
                "kab_kota",
                "kecamatan",
                "kelurahan"
              ].map(function(f) {
                return d[f + "_tinggal"];
              })
              .filter(notEmpty)
              .join(", ");
        }},
        "nama_pasangan": {name: "Nama Pasangan", key: function(d) {
          return d.nama_pasangan;
        }},
        "jumlah_anak": {name: "Jumlah Anak", key: function(d) {
          return d.jumlah_anak;
        }},
        "riwayat_pendidikan": {name: "Riwayat Pendidikan", key: function(d) {
          return listify(d.riwayat_pendidikan.map(function(r) {
            return r.ringkasan;
          }));
        }},
        "riwayat_pekerjaan": {name: "Riwayat Pekerjaan", key: function(d) {
          return listify(d.riwayat_pekerjaan.map(function(r) {
            return r.ringkasan;
          }));
        }},
        "riwayat_organisasi": {name: "Riwayat Organisasi", key: function(d) {
          return listify(d.riwayat_organisasi.map(function(r) {
            return r.ringkasan;
          }));
        }}
      },
      CALEG_BASIC_COLUMNS: [
        [
          "tempat_lahir",
          "jenis_kelamin",
          "status_perkawinan"
        ],
        [
          "agama",
          "tempat_tinggal"
        ]
      ],
      CALEG_DETAIL_COLUMNS: [
        [
          "tempat_lahir",
          "jenis_kelamin",
          "status_perkawinan",
          "nama_pasangan",
          "jumlah_anak",
          "agama",
          "tempat_tinggal"
        ],
        [
          "riwayat_pendidikan",
          "riwayat_pekerjaan",
          "riwayat_organisasi"
        ]
      ]
    },

    initialize: function(options) {
      this.options = utils.extend({}, PetaCaleg.App.defaults, options);

      this.api = this.options.api;
      this.map = this.options.map;
      this.content = d3.select(this.options.content);
      this.breadcrumb = d3.select(this.options.breadcrumb);
      this.candidateModal = this.options.candidateModal;

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
      var context = this.context,
          that = this,
          breadcrumbs = context.breadcrumbs = [],
          content = this.content,
          done = function(error) {
            if (error) {
              console.error("error:", error);
              content
                .html("")
                .classed("error", true)
                .append("div")
                  .attr("class", "alert alert-danger")
                  .text(error);
            } else {
              // console.log("done!");
            }
            that.setBreadcrumbs(breadcrumbs);
          };

      content.selectAll(".alert")
        .remove();

      if (context.lembaga) {
        var lembaga = context.lembaga;
        if (lembaga == "DPRDI") {
          lembaga = "DPRD I";
        }
        breadcrumbs.push({
          text: "Lembaga: " + lembaga,
          context: utils.copy(context, {}, ["lembaga"])
        });

        content
          .call(utils.classify, "lembaga-", context.lembaga)
          .call(utils.classify, "list-", "none");

        switch (context.lembaga) {
          case "DPD":
            this.doProvinces(context, function(error, province) {
              if (error) return done(error);
              if (province) {
                that.doCandidates(context, function(error, candidate) {
                  return done(error);
                });
              } else {
                done();
              }
            });
            break;

          case "DPR":
          case "DPRDI":
            // ah, nested callbacks...
            this.doProvinces(context, function(error, province) {
              if (error) return done(error);
              if (province) {
                that.doDapil(context, function(error, dapil) {
                  if (error) return done(error);
                  if (dapil) {
                    that.doPartai(context, function(error, party) {
                      if (error) return done(error);
                      if (party) {
                        return that.doCandidates(context, function(error, candidate) {
                          if (error) return done(error);
                          return done();
                        });
                      }
                    });
                  } else {
                    done();
                  }
                });
              } else {
                done();
              }
            });
            break;
        }
      }
    },

    showProgress: function(req) {
      var container = this.breadcrumb
            .classed("loading", true),
          loader = container.select(".progress");

      if (loader.empty()) {
        loader = container.insert("div", "*")
          .attr("class", "progress done");
        loader.append("div")
          .attr("class", "progress-bar")
          .attr("role", "progressbar")
          .style("width", "0%");
        loader.append("div")
          .attr("class", "progress-bar rest")
          .attr("role", "progressbar")
          .style("width", "100%");
      }

      var bar = loader
            .classed("done", false)
            .select(".progress-bar")
              .style("width", "0%"),
          rest = loader.select(".progress-bar.rest")
            .style("width", "100%");

      if (this._progressReq) {
        container.classed("loading", false);
        this._progressReq.on("progress", null);
        this._progressReq = null;
      }

      if (!req || req.empty()) {
        container.classed("loading", false);
        bar.style("width", "100%");
        rest.style("width", "0%");
        loader.classed("done", true);
        return req;
      }

      req.on("progress", function(e) {
        var done = e.progress >= 1,
            pct = Math.floor(e.progress * 100);
        bar.style("width", pct + "%");
        rest.style("width", (100 - pct) + "%");
        loader.classed("done", done);
      });
      return this._progressReq = req;
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
        .classed("action", function(d) {
          return !!d.action;
        })
        .select("a")
          .text(function(d) {
            return d.text;
          })
          .attr("href", function(d) {
            return d.context
              ? "#" + that.resolver.getUrlForData(d.context)
              : null;
          });
    },

    doProvinces: function(context, callback) {
      var that = this,
          crumb = {
            text: "Memuat Provinsi...",
            context: utils.copy(context, {}, ["lembaga"]),
            loading: true
          };
      context.breadcrumbs.push(crumb);
      this.setBreadcrumbs(context.breadcrumbs);
      return this.getProvinces(context, function(error, provinces) {

        crumb.text = "Pilih Provinsi";
        crumb.action = true;
        that.setBreadcrumbs(context.breadcrumbs);

        if (error) return callback(error);

        // console.log("provinces:", provinces);

        if (that.map) {
          var features = provinces.map(function(d) {
            return d.feature;
          });
          that.map.setDisplayFeatures(features, "provinsi");
          that.map.on("select", null);
          that.map.selectFeatureById(context.provinsi);
          that.map.on("select", function(props) {
            // console.log("select province:", props.id, props);
            location.hash = that.resolver.getUrlForData({
              lembaga: context.lembaga,
              provinsi: props.id
            });
          });
        }

        if (context.provinsi) {
          var province = utils.first(provinces, context.provinsi);

          if (province) {
            crumb.text = "Provinsi: " + province.nama;
            crumb.action = false;
            crumb.context = utils.copy(context, {}, ["lembaga", "provinsi"]);
            that.setBreadcrumbs(context.breadcrumbs);

            if (that.map) {
              that.map.zoomToFeature(province.feature);
            }
            return callback(null, province);
          } else {
            console.warn("no such province:", context.provinsi, "in", provinces);
            return callback("Tidak ada provinsi: " + context.provinsi);
          }
        } else {
          that.content.call(utils.classify, "list-", "provinsi");
          that.listProvinces(provinces, context);
          if (that.map) {
            that.map.zoomToInitialBounds();
          }
          return callback();
        }
      });
    },

    doCandidates: function(context, callback) {
      var that = this,
          crumb = {
            text: "Memuat Caleg...",
            context: utils.copy(context, {}, ["lembaga", "provinsi", "dapil", "partai"]),
            loading: true
          };
      context.breadcrumbs.push(crumb);
      this.setBreadcrumbs(context.breadcrumbs);
      return this.getCandidates(context, function(error, candidates) {
        crumb.text = "Pilih Caleg";
        crumb.action = true;
        that.setBreadcrumbs(context.breadcrumbs);

        if (error) return callback(error);

        // console.log("candidates:", candidates);
        that.content.call(utils.classify, "list-", "caleg");
        if (that.content.select("ul.caleg").empty()) {
          that.listCandidates(candidates, context);
        } else {
          console.info("already have candidates list!");
        }

        if (context.caleg) {
          var candidate = utils.first(candidates, context.caleg);

          if (candidate) {
            crumb.text = "Caleg: " + candidate.nama;
            crumb.action = false;
            crumb.context = utils.copy(context, {}, ["lembaga", "provinsi", "dapil", "partai", "caleg"]);
            that.setBreadcrumbs(context.breadcrumbs);

            that.selectCandidate(candidate);

            if (context.more === "more") {
              that.showCandidateModal(candidate);
            } else {
              that.hideCandidateModal();
            }
            return callback(null, candidate);
          } else {
            console.warn("no such candidate:", context.caleg, "in", candidates);
            return callback("Tidak ada calon: " + context.caleg);
          }
        }
        return callback();
      });
    },

    getProvinces: function(context, callback) {
      var params = utils.copy(context, {}, ["lembaga"]),
          getBound = this.api.get.bind(this.api),
          that = this;
      return this.showProgress(queue()
        .defer(getBound, "candidate/api/provinsi", params)
        .defer(getBound, "geographic/api/getmap", {
          filename: "admin-provinsi-md.topojson"
        })
        .await(function(error, res, topology) {
          that.checkContext(context);
          if (error) return callback(error);

          var provinces = res.results.provinsi;
          if (!provinces.length) {
            return callback("Tidak ada provinsi.");
          }

          var collection = new PetaCaleg.GeoCollection(topology);
          // sort provinces by name ascending
          provinces.sort(function(a, b) {
            return d3.ascending(a.nama, b.nama);
          });
          provinces.forEach(function(d) {
            d.feature = collection.getFeatureById(d.id);
            if (!d.feature) console.warn("no feature for:", d.id, d);
          });
          return callback(null, provinces);
        }));
    },

    doDapil: function(context, callback) {
      var that = this,
          crumb = {
            text: "Memuat Dapil...",
            context: utils.copy(context, {}, ["lembaga", "provinsi"]),
            loading: true
          };
      context.breadcrumbs.push(crumb);
      this.setBreadcrumbs(context.breadcrumbs);
      return this.getDapil(context, function(error, dapil) {
        crumb.text = "Pilih Dapil";
        crumb.action = true;
        that.setBreadcrumbs(context.breadcrumbs);

        if (error) return callback(error);

        if (dapil.length === 1 && !that.options.collapseSingleDistricts) {
          console.warn("only 1 dapil in:", context.provinsi, dapil[0]);
          // context.breadcrumbs.pop();
          context.dapil = dapil[0].id;
          // return callback(null, dapil[0]);
        }
        // console.log("dapil:", dapil);

        if (that.map) {
          var features = dapil.map(function(d) {
            return d.feature;
          });
          that.map.setDisplayFeatures(features, "dapil");
          that.map.on("select", null);
          that.map.selectFeatureById(context.dapil);
          that.map.on("select", function(props) {
            // console.log("select dapil:", props.id, props);
            location.hash = that.resolver.getUrlForData({
              lembaga: context.lembaga,
              provinsi: context.provinsi,
              dapil: props.id
            });
          });
        }

        if (context.dapil) {
          var selected = utils.first(dapil, context.dapil);

          if (selected) {
            crumb.text = "Dapil: " + selected.nama;
            crumb.action = false;
            crumb.context = utils.copy(context, {}, ["lembaga", "provinsi", "dapil"]);
            that.setBreadcrumbs(context.breadcrumbs);

            if (that.map) {
              that.map.zoomToFeature(selected.feature);
            }
            return callback(null, selected);
          } else {
            console.warn("no such dapil:", context.dapil, "in", dapil);
            return callback("Tidak ada dapil: " + context.dapil);
          }
        } else {

          if (that.options.collapseSingleDistricts && dapil.length === 1) {
            console.warn("only 1 dapil in:", context.provinsi, dapil[0]);
            context.breadcrumbs.pop();
            // context.dapil = dapil[0].id;
            return callback(null, dapil[0]);
          } else {
            that.content.call(utils.classify, "list-", "dapil");
            that.listDapil(dapil, context);
            // that.map.zoomToInitialBounds();
            return callback();
          }
        }
      });
    },

    listDapil: function(dapil, context) {
      this.clearContent();

      var href = (function(d) {
        return "#" + this.resolver.getUrlForData({
          lembaga: context.lembaga,
          provinsi: context.provinsi,
          dapil: d.id
        });
      }).bind(this);

      var title = this.content.append("h3")
            .text("Dapil"),
          list = this.content.append("ul")
            .attr("class", "dapil list-group"),
          items = list.selectAll("li")
            .data(dapil)
            .enter()
            .append("li")
              .attr("class", "dapil list-group-item")
              .call(utils.autoClick),
          icon = items.append("a")
            .attr("class", "pull-left")
            .attr("href", href)
            .append("svg")
              .attr("class", "media-object")
              .call(this.makeMapIcon.bind(this), context),
          head = items.append("div")
            .attr("class", "media-header")
            .append("h4")
              .append("a")
                .text(function(d) {
                  return d.nama;
                })
                .attr("href", href),
          body = items.append("div")
            .attr("class", "media-body"),
          including = body.append("p")
            .text(function(d) {
              return ""; // :TODO: list contained kab/kota, kecamatan, kelurahan here
            });
    },

    getDapil: function(context, callback) {
      var params = utils.copy(context, {}, ["lembaga", "provinsi"]),
          getBound = this.api.get.bind(this.api),
          filename,
          that = this;

      switch (context.lembaga) {
        case "DPR":
          filename = "dapil-dpr-md.topojson";
          break;
        case "DPRDI":
          filename = "dapil-dprdi-md.topojson";
          break;
      }

      return this.showProgress(queue()
        .defer(getBound, "candidate/api/dapil", params)
        .defer(getBound, "geographic/api/getmap", {filename: filename})
        .await(function(error, res, topology) {
          that.checkContext(context);
          if (error) return callback(error);

          var dapil = res.results.dapil;
          if (!dapil.length) {
            return callback("Tidak ada dapil.");
          }

          var collection = new PetaCaleg.GeoCollection(topology, {
            idProperty: "id_dapil"
          });
          // console.log("dapil collection:", collection);
          dapil.forEach(function(d) {
            d.feature = collection.getFeatureById(d.id);
            if (!d.feature) console.warn("no feature for:", d.id, d);
          });
          return callback(null, dapil);
        }));
    },

    doPartai: function(context, callback) {
      var that = this,
          crumb = {
            text: "Memuat Partai...",
            context: utils.copy(context, {}, ["lembaga", "provinsi", "dapil"])
          };
      context.breadcrumbs.push(crumb);
      this.setBreadcrumbs(context.breadcrumbs);
      return this.getPartai(context, function(error, partai) {
        crumb.text = "Pilih Partai";
        crumb.action = true;
        that.setBreadcrumbs(context.breadcrumbs);

        if (error) return callback(error);

        if (context.partai) {
          var selected = utils.first(partai, context.partai);

          if (selected) {
            crumb.text = "Partai: " + selected.nama;
            crumb.action = false;
            crumb.context = utils.copy(context, {}, ["lembaga", "provinsi", "dapil", "partai"]);
            that.setBreadcrumbs(context.breadcrumbs);

            return callback(null, selected);
          } else {
            console.warn("no such partai:", context.partai, "in", partai);
            return callback("Tidak ada partai: " + context.partai);
          }
        } else {
          that.content.call(utils.classify, "list-", "partai");
          that.listPartai(partai, context);
          return callback();
        }
      });
    },

    getPartai: function(context, callback) {
      var params = utils.copy(context, {}, ["lembaga", "provinsi", "dapil"]),
          getBound = this.api.get.bind(this.api),
          that = this;
      return this.showProgress(queue()
        .defer(getBound, "candidate/api/caleg", params)
        .defer(getBound, "candidate/api/partai")
        .await(function(error, caleg, partai) {
          that.checkContext(context);
          if (error) return callback(error);

          var candidates = caleg.results.caleg,
              parties = partai.results.partai;

          if (!candidates.length) {
            return callback("Tidak ada data calon yang tersedia untuk daerah ini.");
          } else if (!parties.length) {
            return callback("Tidak ada data partai yang tersedia untuk daerah ini.");
          }
          var candidatesByParty = d3.nest()
                .key(function(d) { return d.partai.id; })
                .map(candidates),
              matching = parties.filter(function(d) {
                d.caleg = candidatesByParty[d.id];
                return notEmpty(d.caleg);
              });
          return matching.length
            ? callback(null, matching)
            : callback("Tidak ada data calon yang tersedia untuk partai ini.");
        }));
    },

    listPartai: function(partai, context) {
      this.clearContent();

      var href = (function(d) {
        return "#" + this.resolver.getUrlForData({
          lembaga: context.lembaga,
          provinsi: context.provinsi,
          dapil: context.dapil,
          partai: d.id
        });
      }).bind(this);

      var title = this.content.append("h3")
            .text("Partai"),
          list = this.content.append("ul")
            .attr("class", "partai list-group"),
          items = list.selectAll("li")
            .data(partai)
            .enter()
            .append("li")
              .attr("class", "partai list-group-item")
              .call(utils.autoClick),
          icon = items.append("a")
            .attr("class", "pull-left")
            .attr("href", href)
            .append("img")
              .attr("class", "media-object")
              .attr("src", function(d) {
                return d.url_logo_medium;
              }),
          head = items.append("div")
            .attr("class", "media-header"),
          title = head.append("h4")
            .attr("class", "nama")
            .append("a")
              .text(function(d) {
                return d.nama_lengkap;
              })
              .attr("href", href),
          subtitle = head.filter(function(d) {
              return false;
            })
            .append("h5")
              .attr("class", "nama-lengkap")
              .text(function(d) {
                return d.nama_lengkap;
              }),
          body = items.append("div")
            .attr("class", "media-body");

      // add a preview list of candidates
      var title = body.append("h6")
            .attr("class", "caleg-peek"),
          list = title.selectAll("span.caleg")
            .data(function(d) {
              var numlist = Math.min(d.caleg.length, 3);
              d.numleft = d.caleg.length - numlist;
              copy = d.caleg.slice();
              return d3.shuffle(copy).slice(0, numlist);
            })
            .enter()
            .append("span")
              .attr("class", "caleg");

      list.append("span")
        .attr("class", "glyphicon glyphicon-user");

      list.append("span")
        .text(function(d) {
          return " " + d.nama + " ";
        });

      title.append("span")
        .text(function(d) {
          return (d.numleft) ? " dan " + d.numleft + " calon lagi." : ".";
        });
    },

    clearContent: function() {
      this.content.html("");
    },

    listProvinces: function(provinces, context) {
      this.clearContent();

      var href = (function(d) {
        return "#" + this.resolver.getUrlForData({
          lembaga: context.lembaga,
          provinsi: d.id
        });
      }).bind(this);

      var title = this.content.append("h3")
            .text("Provinsi"),
          list = this.content.append("ul")
            .attr("class", "provinsi list-group"),
          items = list.selectAll("li")
            .data(provinces)
            .enter()
            .append("li")
              .attr("class", "provinsi list-group-item")
              .call(utils.autoClick),
          icon = items.append("a")
            .attr("class", "pull-left")
            .attr("href", href)
            .append("svg")
              .attr("class", "media-object")
              .call(this.makeMapIcon.bind(this), context),
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

    checkContext: function(context) {
      var keys = ["lembaga", "provinsi", "dapil", "partai"],
          a = utils.copy(this.context, {}, keys),
          b = utils.copy(context, {}, keys),
          diff = utils.diff(a, b);
      // console.log("comparing:", a, b);
      if (diff.length) {
        throw [
          "context check failed:",
          JSON.stringify(diff),
          "(bailing)"
        ].join(" ");
      }
    },

    makeMapIcon: function(selection, context) {
      var icon = this.options.mapIcon
      if (icon) {
        selection.call(icon.render.bind(icon), context);
      }
    },

    getCandidates: function(context, callback) {
      var params = utils.copy(context, {}, ["lembaga", "provinsi", "dapil", "partai"]),
          getBound = this.api.get.bind(this.api);
      if (params.lembaga === "DPD") {
        return getBound("candidate/api/caleg", params, function(error, res) {
          return error
            ? callback(error)
            : callback(null, res.results.caleg);
        });
      }
      return this.showProgress(queue()
        .defer(getBound, "candidate/api/caleg", params)
        .defer(getBound, "candidate/api/partai")
        .await(function(error, caleg, partai) {
          if (error) return callback(error);

          var candidates = caleg.results.caleg;
          if (!candidates.length) {
            return callback("Tidak ada caleg.");
          }

          var partiesById = d3.nest()
            .key(function(d) { return d.id; })
            .rollup(function(d) { return d[0]; })
            .map(partai.results.partai);
          candidates.forEach(function(d) {
            d.partai = partiesById[d.partai.id];
          });
          return callback(null, candidates);
        }));
    },

    listCandidates: function(candidates, context) {
      this.clearContent();

      var href = (function(d) {
        return "#" + this.resolver.getUrlForData({
          lembaga:  context.lembaga,
          provinsi: context.provinsi,
          dapil:    context.dapil,
          partai:   context.partai,
          caleg:    d.id
        });
      }).bind(this);

      this.content.append("h3")
        .text("Caleg");

      var list = this.content.append("ul")
            .attr("class", "caleg list-group"),
          items = list.selectAll("li")
            .data(candidates)
            .enter()
            .append("li")
              .attr("class", "caleg list-group-item")
              .call(utils.autoClick),
          icon = items.append("a")
            .attr("class", "pull-left")
            .attr("href", href)
            .append("img")
              .attr("class", "media-object photo")
              .attr("src", function(d) {
                return d.foto_url;
              }),
          head = items.append("div")
            .attr("class", "media-header"),
          body = items.append("div")
            .attr("class", "media-body");

      head.append("span")
        .attr("class", 'no-urut')
        .text(function(d) {
          return d.urutan;
        });

      head.append("a")
        .attr("class", "candidate-name")
        .attr("href", href)
        .text(function(d) {
          return d.nama;
        });

      var columns = PetaCaleg.App.CALEG_BASIC_COLUMNS
        .map(function(fields) {
          return fields.map(function(key) {
            return PetaCaleg.App.CALEG_FIELDS[key];
          });
        });

      var ul = body.selectAll("ul.candidate-info")
            .data(function(d) {
              // each "column" is a list of fields + values
              var cols = columns.map(function(fields) {
                return {
                  caleg: d,
                  fields: fields.map(function(field) {
                    return {
                      caleg: d,
                      field: field,
                      value: field.key(d)
                    };
                  })
                  .filter(function(d) {
                    return d.value;
                  })
                };
              });

              // ensure that there are at least 2 fields in the first column
              var first = cols[0].fields,
                  second = cols[1].fields;
              while (first.length < 2 && second.length) {
                first.push(second.pop());
              }

              return cols;
            })
            .enter()
            .append("ul")
              .attr("class", "candidate-info"),
          li = ul.selectAll("li")
            .data(function(d) {
              // and each column gets a list item for each of its fields
              return d.fields;
            })
            .enter()
            .append("li");

      li.append("span")
        .attr("class", "header")
        .text(function(d) {
          return d.field.name;
        });

      li.append("span")
        .attr("class", "content")
        .html(function(d) {
          return d.value;
        });

      if (this.candidateModal) {
        var that = this;

        var link = body.select("ul:last-child")
          .append("li")
            .attr("class", "more")
            .append("a")
              .attr("href", function(d) {
                return href(d) + "/more";
              })
              .on("click", function(d) {
                that.showCandidateModal(d);
              });

        link.append("span")
          .attr("class", "glyphicon glyphicon-plus-sign");
        link.append("span")
          .text(" More");
      }
    },

    selectCandidate: function(candidate) {
      this.content.selectAll("li.caleg")
        .classed("active", function(d) {
          return d.id == candidate.id;
        })
        .filter(".active")
          .each(function(d) {
            // this.scrollIntoView();
          });
    },

    showCandidateModal: function(candidate) {
      if (!this.candidateModal) return;

      if (this._candidateReq) {
        this._candidateReq.abort();
        this._candidateReq = null;
      }

      var modal = this.candidateModal,
          that = this;

      modal._selection
        .classed("loading", true)
        .select(".modal-title")
          .text(candidate.nama);

      var mbody = modal._selection
        .select(".modal-body")
        .text("");

      mbody.append("img")
        .attr("class", "photo")
        .attr("src", candidate.foto_url);

      var mtitle = mbody.append("h4")
        .text("Memuat...");

      var uri = "candidate/api/caleg/" + candidate.id;
      this._candidateReq = this.api.get(uri, function(error, res) {
        modal._selection.classed("loading", false);

        console.log("got caleg data:", res);
        that._candidateReq = null;

        mtitle.remove();

        var columns = PetaCaleg.App.CALEG_DETAIL_COLUMNS
          .map(function(fields) {
            return fields.map(function(key) {
              return PetaCaleg.App.CALEG_FIELDS[key];
            });
          });

        var info = res.results.caleg[0],
            ul = mbody.datum(info)
              .selectAll("ul.candidate-info")
              .data(function(d) {
                // each "column" is a list of fields + values
                return columns.map(function(fields) {
                  return {
                    caleg: d,
                    fields: fields.map(function(field) {
                      return {
                        caleg: d,
                        field: field,
                        value: field.key(d)
                      };
                    })
                    .filter(function(d) {
                      return d.value;
                    })
                  };
                });
              })
              .enter()
              .append("ul")
                .attr("class", "candidate-info"),
            li = ul.selectAll("li")
              .data(function(d) {
                // and each column gets a list item for each of its fields
                return d.fields;
              })
              .enter()
              .append("li");

        li.append("span")
          .attr("class", "header")
          .text(function(d) {
            return d.field.name;
          });

        li.append("span")
          .attr("class", "content")
          .html(function(d) {
            return d.value;
          });
      });

      modal.show();
    },

    hideCandidateModal: function() {
      if (!this.candidateModal) return;

      this.candidateModal.hide();
    }

  });

  PetaCaleg.GeoCollection = new PetaCaleg.Class({
    defaults: {
      idProperty: "id",
      topologyKey: null
    },

    initialize: function(data, options) {
      options = this.options = utils.extend({}, PetaCaleg.GeoCollection.defaults, options);

      var collection,
          topologyKey = options.topologyKey;
      switch (data.type) {
        case "Topology":
          if (!topologyKey) topologyKey = Object.keys(data.objects)[0];
          collection = topojson.feature(data, data.objects[topologyKey]);
          break;
        case "FeatureCollection":
          collection = data;
          break;
        default:
          collection = {
            type: "FeatureCollection",
            features: [data]
          };
      }

      this.collection = collection;
      this.features = collection.features.slice();

      var id = options.idProperty;
      collection.features.forEach(function(d) {
        d.id = d.properties[id] || d[id];
        // console.log(d.id, ":", d);
      });

      this.lookup = d3.nest()
        .key(function(d) {
          return d.id;
        })
        .rollup(function(d) {
          return d[0];
        })
        .map(collection.features);
    },

    getFeatureById: function(id) {
      return this.lookup[id];
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
            : {},
          req;
      // prefer absolute matches
      for (var i = 0, len = this.routes.length; i < len; i++) {
        var route = this.routes[i];
        if (route.url === url) {
          req = {
            url: url,
            data: {},
            query: query
          };
          break;
        }
      }
      if (!req) {
        for (var i = 0, len = this.routes.length; i < len; i++) {
          var route = this.routes[i],
              match = url.match(route.pattern);
          if (match) {
            var data = {};
            for (var j = 1; j < match.length; j++) {
              var key = route.keys[j - 1];
              data[key] = match[j];
            }
            req = {
              url: url,
              data: data,
              query: query
            };
            break;
          }
        }
      }
      if (!req) return null;
      if (route.callback) {
        route.callback(req);
      }
      return req;
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
        // :TODO: temporary hack to get Kaltim results for Kaltara
        if (params.provinsi == 65) {
          params.provinsi = 64;
        }
        url += "?" + qs.format(params);
      }
      if (this._cache && this._cache[url]) {
        return callback(null, this._cache[url]);
      }
      var that = this;
      return this._req = d3.json(url, function(error, res) {
        if (error) {
          console.warn("API error:", error, error.getAllResponseHeaders());
          return callback.call(this, error);
        }
        if (that._cache) that._cache[url] = res.data || res;
        last = null;
        that._req = null;
        return callback.call(this, null, res.data || res);
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

  PetaCaleg.MapIcon = new PetaCaleg.Class({
    defaults: {
      margin: 5,
      getFeature: function(d) {
        return d.feature;
      }
    },

    initialize: function(options) {
      this.options = options = utils.extend({}, PetaCaleg.MapIcon.defaults, options);
      this.proj = d3.geo.mercator();
      this.path = d3.geo.path()
        .projection(this.proj);
    },

    render: function(selection) {
      selection.classed("map", true);

      if (this.options.background) {
        selection.append("g")
          .attr("class", "bg")
          .append("use")
            .attr("xlink:href", this.options.background);
      }

      var getFeature = this.options.getFeature,
          path = this.path,
          margin = this.options.margin;

      selection.append("g")
        .attr("class", "fg")
        .append("path")
          .datum(getFeature)
          .attr("d", path);

      selection.attr("viewBox", function(d) {
        var feature = getFeature.apply(this, arguments);
        if (!feature) return;

        var bounds = path.bounds(feature),
            x = bounds[0][0],
            y = bounds[0][1],
            w = bounds[1][0] - x,
            h = bounds[1][1] - y,
            ew = this.offsetWidth,
            eh = this.offsetHeight,
            scale = Math.max(w, h) / Math.min(ew, eh),
            m = margin * scale;
        return [x - m, y - m, w + m * 2, h + m * 2].join(" ");
      });
    }
  });

  PetaCaleg.Modal = new PetaCaleg.Class({
    defaults: {
      closeHash: ""
    },

    initialize: function(selector, options) {
      this.options = utils.extend({}, PetaCaleg.Modal.defaults, options);

      var that = this;
      this._selection = d3.select(selector)
        .on("click.background", function() {
          if (d3.event.target === this) {
            that.close();
          }
        });

      this._selection
        .select(".close")
          .on("click.close", this.close.bind(this));

      this.dispatch = d3.dispatch("show", "hide");
      d3.rebind(this, this.dispatch, "on");
      this.hide();
    },

    show: function() {
      this._selection
        .style("display", "block")
        .classed("in", true);
      this.dispatch.show();
    },

    hide: function() {
      this._selection
        .style("display", "none")
        .classed("in", false);
      this.dispatch.hide();
    },

    close: function() {
      this.hide();
      var history = window.history;
      if (history.length) {
        history.go(-1);
      } else {
        location.hash = this.options.closeHash;
      }
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
            fillColor: "#555555",
            fillOpacity: .5,
            strokeColor: "#cccccc",
            strokeWeight: .5,
            strokeOpacity: 1
          },
          offHover: {
            fillColor: "#555555",
            fillOpacity: .75,
            strokeColor: "#cccccc",
            strokeWeight: .5,
            strokeOpacity: 1
          },
          on: {
            fillColor: "#ff00ff",
            fillOpacity: .5,
            strokeColor: "#cccccc",
            strokeWeight: .5,
            strokeOpacity: 1
          },
          onHover: {
            fillColor: "#ff00ff",
            fillOpacity: .75,
            strokeColor: "#cccccc",
            strokeWeight: .5,
            strokeOpacity: 1
          }
        }
      },

      initialize: function(options) {
        options = this.options = utils.extend({}, PetaCaleg.Map.defaults, options);
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
        this.dispatch = d3.dispatch("select");
        d3.rebind(this, this.dispatch, "on");
      },

      fitBounds: function(bounds) {
        var sw = bounds.getSouthWest(),
            ne = bounds.getNorthEast(),
            h = sw.lat() - ne.lat(),
            w = sw.lng() - ne.lng(),
            scale = .24,
            pad = Math.max(h * scale, w * scale),
            smaller = new google.maps.LatLngBounds(
              new google.maps.LatLng(sw.lat() - pad, sw.lng() - pad),
              new google.maps.LatLng(ne.lat() + pad, ne.lng() + pad)
            );
        // console.log(bounds.toString(), "->", smaller.toString(), [w, h]);
        return google.maps.Map.prototype.fitBounds.call(this, smaller);
      },

      zoomToFeature: function(feature) {
        var bounds = d3.geo.bounds(feature); // [[W, N], [E, S]]
        this.fitBounds(new google.maps.LatLngBounds(
          // SW
          new google.maps.LatLng(bounds[1][1], bounds[0][0]),
          // NE
          new google.maps.LatLng(bounds[0][1], bounds[1][0])
        ));
      },

      zoomToInitialBounds: function() {
        if (this.options.bounds) {
          this.fitBounds(this.options.bounds);
        } else {
          this.setZoom(this.options.zoom);
          this.setCenter(this.options.center);
        }
      },

      setDisplayFeatures: function(features, id) {
        if (this._displayId === id) return;
        this._displayId = id;

        // console.log("features:", features);

        // copy the id down to the properties, because this is the part that
        // gets passed down to GeoJSON layers
        features.forEach(function(feature) {
          feature.properties.id = feature.id;
        });

        // remove the old layers
        this.removeDisplayLayers();

        var layer = new GeoJSON({
          type: "FeatureCollection",
          features: features
        }, this.featureStyles.off);

        this.displayLayers = this.addLayer(layer);
      },

      removeDisplayLayers: function() {
        if (this.displayLayers) {
          var layers = this.displayLayers;
          while (layers.length) {
            var layer = layers.shift();
            layer.setMap(null);
          }
        }
      },

      addLayer: function(layer) {
        var added = [],
            that = this;
        if (Array.isArray(layer)) {
          layer.forEach(function(d) {
            added = added.concat(that.addLayer(d));
          });
        } else {
          layer.setMap(this);
          this.addLayerListeners(layer);
          added.push(layer);
        }
        return added;
      },

      addLayerListeners: function(layer) {
        var that = this,
            addListener = google.maps.event.addListener;
        addListener(layer, "mouseover", function() {
          that.setHoverFlag(this.geojsonProperties, true);
        });
        addListener(layer, "click", function() {
          that.setHoverFlag(this.geojsonProperties, false);
          that.selectFeatureById(this.geojsonProperties.id);
        });
        addListener(layer, "mouseout", function() {
          that.setHoverFlag(this.geojsonProperties, false);
        });
      },

      setHoverFlag: function(props, flag) {
        var that = this;
        this.displayLayers.forEach(function(layer) {
          if (layer.geojsonProperties === props) {
            layer.hover = flag;
          }
          that.updateLayerStyle(layer);
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

        if (selected.length) {
          this.dispatch.select(selected[0].geojsonProperties);
        }

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
        "featureType": "landscape",
        "stylers": [{"visibility": "off"}]
      },
      {
        "featureType": "road",
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

  function noop() {
  }

  function empty(d) {
    return !d;
  }

  function notEmpty(d) {
    return d && d.length;
  }

  var df = d3.time.format("%Y-%m-%d"),
      now = new Date(),
      jenisMap = {
        "L": "Laki-laki",
        "P": "Perempuan"
      },
      indonesianMonths = [
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember"
      ];

  function prettyTTL(d) {
    var bits = [d.tempat_lahir, prettyDate(d)]
    return bits
      .filter(notEmpty)
      .join("<br>");
  }

  function prettyDate(d) {
    var date = df.parse(d.tanggal_lahir);
    if (date) {
      return [
        date.getDate(),
        indonesianMonths[date.getMonth()],
        date.getFullYear()
      ].join(" ");
    }
    return null;
  }

  function age(d) {
    var date = df.parse(d.tanggal_lahir);
    if (date) {
      var years = d3.time.year.range(date, now).length;
      return "(" + years + " thn)";
    }
    return null;
  }

  function listify(items) {
    if (items.length > 0) {
      return "<ol><li>" + items.join("</li><li>") + "</li></ol>";
    }
    return ""
  }

})(this);

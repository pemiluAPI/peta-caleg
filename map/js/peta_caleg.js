(function(exports) {

  var pc = {
    version: "0.0.1"
  };

  // export this to window.peta_caleg
  exports.peta_caleg = pc;

  try {
    var gm = google.maps;
  } catch (err) {
    console.error("the Google Maps JS API is required");
    return;
  }

  // Indonesia-specific constants
  pc.geo = {
    bounds: new gm.LatLngBounds(
      new gm.LatLng(-11.56, 94.49),
      new gm.LatLng(7.75, 141.95)
    )
  };

})(this);

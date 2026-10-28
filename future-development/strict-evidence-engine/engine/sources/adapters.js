"use strict";

class ActivityWeightingAdapter {
  async weights() { throw new Error("ActivityWeightingAdapter.weights must be implemented"); }
}

class LicensedSocialDatabaseAdapter {
  async evidence() { throw new Error("LicensedSocialDatabaseAdapter.evidence must be implemented"); }
}

class PsilcaAdapter extends LicensedSocialDatabaseAdapter {}
class SocialHotspotsDatabaseAdapter extends LicensedSocialDatabaseAdapter {}
class ExiobaseAdapter extends ActivityWeightingAdapter {}

module.exports = { ActivityWeightingAdapter, ExiobaseAdapter, LicensedSocialDatabaseAdapter, PsilcaAdapter, SocialHotspotsDatabaseAdapter };

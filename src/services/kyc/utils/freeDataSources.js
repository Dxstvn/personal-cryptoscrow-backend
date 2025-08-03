// src/services/kyc/utils/freeDataSources.js

/**
 * Configuration for free, authentic PEP and sanctions data sources
 */
export const freeDataSources = {
  sanctions: {
    // US Treasury OFAC
    ofac: {
      name: 'OFAC SDN List',
      description: 'US Treasury Specially Designated Nationals',
      homepage: 'https://sanctionssearch.ofac.treas.gov/',
      downloads: {
        sdn: {
          txt: 'https://www.treasury.gov/ofac/downloads/sdnlist.txt',
          xml: 'https://www.treasury.gov/ofac/downloads/sdn.xml',
          csv: 'https://www.treasury.gov/ofac/downloads/sdnlist.csv'
        },
        consolidated: {
          xml: 'https://www.treasury.gov/ofac/downloads/consolidated/consolidated.xml'
        },
        // Additional lists
        nonSDN: 'https://www.treasury.gov/ofac/downloads/ctrylst.txt'
      },
      updateFrequency: 'daily',
      authentication: 'none'
    },

    // UN Security Council
    un: {
      name: 'UN Security Council Sanctions',
      description: 'United Nations consolidated sanctions list',
      homepage: 'https://www.un.org/securitycouncil/content/un-sc-consolidated-list',
      downloads: {
        xml: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
        html: 'https://scsanctions.un.org/search/',
        // Individual lists by regime
        alQaida: 'https://scsanctions.un.org/resources/xml/en/alqaida.xml',
        taliban: 'https://scsanctions.un.org/resources/xml/en/taliban.xml'
      },
      updateFrequency: 'as_needed',
      authentication: 'none'
    },

    // European Union
    eu: {
      name: 'EU Consolidated Sanctions',
      description: 'European Union financial sanctions',
      homepage: 'https://www.sanctionsmap.eu/',
      downloads: {
        // Note: EU changed their API, may need registration
        api: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content',
        // Alternative endpoint
        json: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/jsonFullSanctionsList_1_1/content'
      },
      updateFrequency: 'weekly',
      authentication: 'may_require_registration'
    },

    // United Kingdom
    uk: {
      name: 'UK HM Treasury Sanctions',
      description: 'UK consolidated sanctions list',
      homepage: 'https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets',
      downloads: {
        csv: 'https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/[ID]/UK_Sanctions_List.csv',
        xml: 'https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/[ID]/UK_Sanctions_List.xml',
        // Note: [ID] changes with each update, need to scrape the page for current URL
      },
      updateFrequency: 'weekly',
      authentication: 'none',
      note: 'URLs change with each update, requires page scraping'
    },

    // Canada
    canada: {
      name: 'Canadian Sanctions',
      description: 'Global Affairs Canada sanctions',
      homepage: 'https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx',
      downloads: {
        xml: 'https://www.international.gc.ca/world-monde/assets/office_docs/international_relations-relations_internationales/sanctions/sema-lmes.xml'
      },
      updateFrequency: 'as_needed',
      authentication: 'none'
    },

    // Australia
    australia: {
      name: 'Australian Sanctions',
      description: 'Department of Foreign Affairs sanctions',
      homepage: 'https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list',
      downloads: {
        xlsx: 'https://www.dfat.gov.au/sites/default/files/regulation8_consolidated.xlsx',
        pdf: 'https://www.dfat.gov.au/sites/default/files/regulation8_consolidated.pdf'
      },
      updateFrequency: 'as_needed',
      authentication: 'none'
    },

    // Japan
    japan: {
      name: 'Japanese Sanctions',
      description: 'Ministry of Finance Japan sanctions',
      homepage: 'https://www.mof.go.jp/policy/international_policy/gaitame_kawase/gaitame/economic_sanctions/list.html',
      downloads: {
        // Japanese sanctions are in PDF format, harder to parse
        pdf: 'various PDF files'
      },
      updateFrequency: 'as_needed',
      authentication: 'none',
      language: 'Japanese/English'
    },

    // Switzerland
    switzerland: {
      name: 'Swiss SECO Sanctions',
      description: 'State Secretariat for Economic Affairs sanctions',
      homepage: 'https://www.seco.admin.ch/seco/en/home/Aussenwirtschaftspolitik_Wirtschaftliche_Zusammenarbeit/Wirtschaftsbeziehungen/exportkontrollen-und-sanktionen/sanktionen-embargos.html',
      downloads: {
        // XML format available
        xml: 'https://www.seco.admin.ch/seco/en/home/Aussenwirtschaftspolitik_Wirtschaftliche_Zusammenarbeit/Wirtschaftsbeziehungen/exportkontrollen-und-sanktionen/sanktionen-embargos/smart-sanctions--sanktionsverordnungen-des-bundes.html'
      },
      updateFrequency: 'as_needed',
      authentication: 'none'
    }
  },

  pep: {
    // Every Politician (mySociety)
    everyPolitician: {
      name: 'Every Politician',
      description: 'Global politician database by mySociety',
      homepage: 'https://everypolitician.org/',
      downloads: {
        countries: 'https://everypolitician.org/countries.json',
        // Individual country data
        example: 'https://cdn.rawgit.com/everypolitician/everypolitician-data/{SHA}/data/{Country}/{House}/names.csv'
      },
      updateFrequency: 'varies',
      authentication: 'none',
      note: 'May not be actively maintained'
    },

    // CIA World Leaders
    cia: {
      name: 'CIA World Leaders',
      description: 'Current heads of state and government',
      homepage: 'https://www.cia.gov/resources/world-leaders/',
      format: 'HTML pages (requires scraping)',
      updateFrequency: 'monthly',
      authentication: 'none'
    },

    // Wikidata
    wikidata: {
      name: 'Wikidata',
      description: 'Structured data from Wikipedia',
      homepage: 'https://www.wikidata.org/',
      api: 'https://query.wikidata.org/sparql',
      exampleQuery: `
        SELECT ?person ?personLabel ?position ?positionLabel ?country ?countryLabel WHERE {
          ?person wdt:P39 ?position.
          ?position wdt:P279* wd:Q82955. # political position
          ?person wdt:P27 ?country.
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
        LIMIT 1000
      `,
      updateFrequency: 'real-time',
      authentication: 'none'
    },

    // OpenSanctions
    openSanctions: {
      name: 'OpenSanctions',
      description: 'Aggregated sanctions and PEP data',
      homepage: 'https://www.opensanctions.org/',
      downloads: {
        datasets: 'https://www.opensanctions.org/datasets/',
        api: 'https://api.opensanctions.org/v1/',
        bulk: 'https://data.opensanctions.org/datasets/latest/'
      },
      datasets: [
        'sanctions',
        'peps',
        'crime',
        'default' // Combined dataset
      ],
      updateFrequency: 'daily',
      authentication: 'free_api_key'
    },

    // World Bank Debarred Firms
    worldBank: {
      name: 'World Bank Listing of Ineligible Firms',
      description: 'Debarred firms and individuals',
      homepage: 'https://www.worldbank.org/en/projects-operations/procurement/debarred-firms',
      downloads: {
        json: 'https://apigwext.worldbank.org/dvsvc/v1.0/json/APPLICATION/ADOBE_EXPRNCE_MGR/FIRM/SANCTIONED_FIRM',
        excel: 'https://www.worldbank.org/content/dam/worldbank/document/sanctions/other/world-bank-listing-of-ineligible-firms.xlsx'
      },
      updateFrequency: 'monthly',
      authentication: 'none'
    }
  },

  aggregators: {
    // Consolidated data sources
    openSanctions: {
      name: 'OpenSanctions',
      description: 'Best free aggregator of sanctions and PEP data',
      features: [
        'Combines multiple official sources',
        'Standardized data format',
        'Entity deduplication',
        'Regular updates',
        'REST API available'
      ],
      coverage: [
        'US OFAC',
        'UN Sanctions',
        'EU Sanctions',
        'UK Sanctions',
        'Interpol Red Notices',
        'National PEP lists',
        'Financial crime databases'
      ]
    },

    // ICIJ Offshore Leaks
    icij: {
      name: 'ICIJ Offshore Leaks Database',
      description: 'Panama Papers, Paradise Papers, etc.',
      homepage: 'https://offshoreleaks.icij.org/',
      api: 'https://offshoreleaks.icij.org/api/v1/',
      datasets: [
        'Panama Papers',
        'Paradise Papers',
        'Bahamas Leaks',
        'Offshore Leaks'
      ],
      authentication: 'none'
    }
  },

  implementation_notes: {
    best_practices: [
      'Always verify data freshness - check last update dates',
      'Implement robust error handling for changed URLs',
      'Cache data locally with expiration',
      'Use multiple sources for better coverage',
      'Normalize data formats for consistency',
      'Handle various character encodings',
      'Implement retry logic for failed downloads'
    ],
    
    recommended_approach: [
      '1. Start with OpenSanctions for aggregated data',
      '2. Supplement with direct government sources',
      '3. Use Wikidata for PEP information',
      '4. Cross-reference multiple sources',
      '5. Implement fuzzy matching for name variations'
    ],

    legal_considerations: [
      'These are public, official sources',
      'No licensing restrictions for sanctions lists',
      'Always attribute the source',
      'Comply with data protection laws',
      'Do not use for discrimination',
      'Implement proper data retention policies'
    ]
  }
};

/**
 * Get recommended free data sources
 */
export function getRecommendedSources() {
  return {
    sanctions: [
      'ofac',      // Most comprehensive US list
      'un',        // Global coverage
      'eu',        // European coverage
      'uk',        // UK specific
      'openSanctions' // Best aggregator
    ],
    pep: [
      'openSanctions', // Best free option
      'wikidata',      // Good for current leaders
      'cia'            // Authoritative for heads of state
    ]
  };
}

/**
 * Get source by ID
 */
export function getSourceConfig(type, id) {
  return freeDataSources[type]?.[id] || null;
}
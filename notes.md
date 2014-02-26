- interactive region maps
  * three levels:
    1. DPD (33 provincial districts, 946 candidates)
    2. DPR (77 provincial districts, 6606 candidates, by party)
    3. DPRDI (258 electoral districts, up to 25-30k candidates, ~2500 per district)
  * select a region to see the candidates
    - get these from the API

## URLs

```
/
/{province}
/{province}/{body}
/{province}/{body}/candidate/{candidate}
/{province}/{body}/district/{district}
/{province}/{body}/party/{party}
```

## navigation
* DPD
  - select a province (33) to see candidates
* DPR
  - select a province (33) to see electoral districts
  - select a district (1-11) to see candidates
  - select a party (12-15) to filter candidates
* DPRDI ("DPRD")
  - select a province (33) to see electoral districts
  - select a district (12-15) to see candidates
  - select a party (12-15) to filter candidates

## API
key: `7941b0baecd128c4de3a9ae63a85fd2c`
docs: http://docs.candidateapi.apiary.io/

provinces:
    `http://api.pemiluapi.org/candidate/api/provinsi?apiKey=7941b0baecd128c4de3a9ae63a85fd2c`

electoral districts for a specific province:
    `http://api.pemiluapi.org/candidate/api/provinsi/11?apiKey=7941b0baecd128c4de3a9ae63a85fd2c`

electoral districts for a province in the DPR:
    `http://api.pemiluapi.org/candidate/api/dapil?apiKey=7941b0baecd128c4de3a9ae63a85fd2c&provinsi=11&lembaga=DPR` (DPRDI)

pipeline {
  agent any
  environment {
    NXRADAR_API_KEY    = credentials('nxradar-api-key')
    NXRADAR_ORG_ID     = '72OO5R9SCO'
    // Docker Jenkins → host upload-server. Use http://127.0.0.1:7007 if Jenkins is on the host.
    NXRADAR_UPLOAD_URL = 'http://host.docker.internal:7007'
    // Required: Client ObjectId from NxRadar UI (24-char hex)
    NXRADAR_CLIENT_ID  = '693bde842d84d0e636c80b89'
    // Auto-create: no APP_ID needed
    APP_NAME           = 'cicd-test-project'
    GROUP_NAME         = 'jenkins-cicd-test'
    SUPPLIER           = 'Internal'
    ENVIRONMENT        = 'Dev'
    CRITICALITY        = 'Medium'
  }
  stages {
    stage('Checkout') {
      steps { checkout scm }
    }
    stage('Upload SBOM') {
      steps {
        sh '''
          set -e
          curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b .
          ./syft . -o cyclonedx-json > sbom.json

          # First run: creates group (if missing) + application under this client.
          # Later runs: reuses the same app and uploads a new version.
          RESPONSE=$(curl -sf -X POST \
            -H "Authorization: Bearer $NXRADAR_API_KEY" \
            -H "x-org-id: $NXRADAR_ORG_ID" \
            -F "sbom=@sbom.json" \
            -F "clientId=$NXRADAR_CLIENT_ID" \
            -F "applicationName=$APP_NAME" \
            -F "applicationVersion=${BUILD_NUMBER}" \
            -F "groupName=$GROUP_NAME" \
            -F "supplier=$SUPPLIER" \
            -F "environment=$ENVIRONMENT" \
            -F "criticality=$CRITICALITY" \
            -F "ciSystem=jenkins" \
            -F "branch=${GIT_BRANCH:-master}" \
            -F "commit=$(git rev-parse HEAD)" \
            -F "pipelineId=${BUILD_TAG}" \
            "$NXRADAR_UPLOAD_URL/api/v1/scans/upload")

          echo "Upload response: $RESPONSE"
          SBOM_ID=$(echo "$RESPONSE" | jq -r '.data.sbomId // .data.scanId // empty')
          AUTO=$(echo "$RESPONSE" | jq -r '.data.autoCreated // false')
          echo "scanId=$SBOM_ID autoCreated=$AUTO"
          test -n "$SBOM_ID"
        '''
      }
    }
  }
}

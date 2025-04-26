# hlx-cypress
cypress container for BMC Helix Innovation Suite


# Build image
podman build -t hlx-cypress .

# Run with podman
podman run --rm \
  -e HELIX_URL=http://localhost \
  -e HELIX_USER=Demo \
  -e HELIX_PASS=P@ssw0rd \
  -e HELIX_RECORDING_FORM=hlx.cypress:Recordings \
  -e HELIX_FORM=hlx.cypress:TestResults \
  hlx-cypress

podman run --rm hlx-cypress


<!-- antislop: allow-file passive-voice -->
<!-- The scenarios keep the fixed SHALL/WHEN/THEN grammar of the live
     demo-deployment spec, which carries the same directive. -->

# Spec Delta

## REMOVED Requirements

### Requirement: The engine image builds off the server

**Reason**: The owner prefers the build on the server, as the earlier Docker
stack did. Each deploy then ships no image, and the operator's machine needs
no Podman.

**Migration**: "The server builds the engine image from a pushed commit"
replaces it. `scripts/deploy-demo.sh` drives the build over SSH.

## ADDED Requirements

### Requirement: The server builds the engine image from a pushed commit

`scripts/deploy-demo.sh` SHALL deploy the commit the operator has checked out,
and SHALL refuse a commit that no remote branch contains. The server SHALL keep
a checkout of the repository and move it to exactly that commit. The server
SHALL build the engine image from that checkout. The operator's machine SHALL
NOT build or upload an image. The units and scripts the server runs SHALL come
from the same checkout.

#### Scenario: A later deploy

- **WHEN** the operator runs `scripts/deploy-demo.sh` with a pushed commit
  checked out
- **THEN** the server checks out that commit, builds the image and restarts
  the pod
- **AND** no image crosses the network from the operator's machine

#### Scenario: An unpushed commit

- **WHEN** the operator runs `scripts/deploy-demo.sh` on a commit that no
  remote branch contains
- **THEN** the script stops before it contacts the server, and names the
  reason

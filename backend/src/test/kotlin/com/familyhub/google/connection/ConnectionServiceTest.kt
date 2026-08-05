package com.familyhub.google.connection

import com.familyhub.google.credentials.CredentialsService
import com.familyhub.google.credentials.GoogleCredentials
import com.familyhub.google.crypto.EncryptionService
import com.familyhub.google.oauth.*
import com.familyhub.google.token.GoogleTokenProvider
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import com.familyhub.settings.SettingsService
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import io.mockk.*
import org.assertj.core.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.Optional
import java.util.UUID

class ConnectionServiceTest {
    private val credentials = mockk<CredentialsService>()
    private val flow = mockk<GoogleOAuthFlow>()
    private val stateStore = mockk<OAuthStateStore>()
    private val pkce = mockk<PkceGenerator>()
    private val connections = mockk<GoogleConnectionRepository>(relaxed = true)
    private val members = mockk<FamilyMemberRepository>(relaxed = true)
    private val enc = EncryptionService("test-key-with-more-than-32-characters-in-it")
    private val settings = mockk<SettingsService>(relaxed = true)
    private val tokenProvider = mockk<GoogleTokenProvider>(relaxed = true)
    private lateinit var service: ConnectionService

    private val credId = UUID.randomUUID()
    private val credEntity =
        GoogleCredentials(
            clientId = enc.encrypt("cid"),
            clientSecret = enc.encrypt("sec"),
            redirectUri = "http://localhost:8080/oauth/callback",
            nickname = "Familie",
            isPrimary = true,
        ).also { it.id = credId }

    @BeforeEach
    fun setup() {
        service = ConnectionService(credentials, flow, stateStore, pkce, connections, members, enc, settings, tokenProvider)
    }

    // ─── startAuthorization ──────────────────────────────────────────────────

    @Test
    fun `startAuthorization with explicit credentialsId uses entity()`() {
        every { credentials.entity(credId) } returns credEntity
        every { pkce.generateVerifier() } returns "verifier"
        every { pkce.challengeFor("verifier") } returns "challenge"
        every { stateStore.create(credId, "/setup", "verifier", null) } returns "state-nonce"
        every { flow.buildAuthorizationUrl("cid", credEntity.redirectUri, "state-nonce", "challenge") } returns "https://accounts.google.com/auth"

        val url = service.startAuthorization(credId, "/setup")

        assertThat(url).isEqualTo("https://accounts.google.com/auth")
        verify { credentials.entity(credId) }
        verify(exactly = 0) { credentials.primaryOrNull() }
    }

    @Test
    fun `startAuthorization with null credentialsId falls back to primaryOrNull()`() {
        every { credentials.primaryOrNull() } returns credEntity
        every { pkce.generateVerifier() } returns "verifier"
        every { pkce.challengeFor("verifier") } returns "challenge"
        every { stateStore.create(credId, "/home", "verifier", null) } returns "state-nonce"
        every { flow.buildAuthorizationUrl("cid", credEntity.redirectUri, "state-nonce", "challenge") } returns "https://accounts.google.com/auth2"

        val url = service.startAuthorization(null, "/home")

        assertThat(url).isEqualTo("https://accounts.google.com/auth2")
        verify { credentials.primaryOrNull() }
    }

    @Test
    fun `startAuthorization with null credentialsId and no primary throws ResourceNotFoundException`() {
        every { credentials.primaryOrNull() } returns null

        assertThatThrownBy { service.startAuthorization(null, "/setup") }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    @Test
    fun `startAuthorization forwards memberId into the state`() {
        val memberId = UUID.randomUUID()
        every { credentials.entity(credId) } returns credEntity
        every { pkce.generateVerifier() } returns "verifier"
        every { pkce.challengeFor("verifier") } returns "challenge"
        every { stateStore.create(credId, "/settings", "verifier", memberId) } returns "nonce"
        every { flow.buildAuthorizationUrl(any(), any(), any(), any()) } returns "https://g"

        service.startAuthorization(credId, "/settings", memberId)

        verify { stateStore.create(credId, "/settings", "verifier", memberId) }
    }

    @Test
    fun `handleCallback with memberId links a new connection to the existing member`() {
        val memberId = UUID.randomUUID()
        val existingMember = FamilyMember(name = "Anna", role = "parent", color = "blue").also { it.id = memberId }
        every { stateStore.consume("state") } returns OAuthStateEntry(credId, "/settings", "verifier", memberId)
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("access", "refresh", 3600, "calendar")
        every { flow.fetchUserInfo("access") } returns GoogleUserInfo("sub-1", "anna@gmail.com", "Anna Google", null)
        every { connections.findByGoogleAccountId("sub-1") } returns null
        every { connections.findByFamilyMemberId(memberId) } returns null
        every { members.findById(memberId) } returns Optional.of(existingMember)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        val result = service.handleCallback("code", "state")

        assertThat(result.memberId).isEqualTo(memberId)
        assertThat(result.isNewMember).isFalse()
        verify(exactly = 0) { members.save(any()) }
        verify { connections.save(match<GoogleConnection> { it.familyMemberId == memberId && it.googleAccountId == "sub-1" }) }
    }

    @Test
    fun `handleCallback with memberId replaces the members existing connection`() {
        val memberId = UUID.randomUUID()
        val existingMember = FamilyMember(name = "Anna", role = "parent", color = "blue").also { it.id = memberId }
        val prior = GoogleConnection(
            familyMemberId = memberId, credentialsId = credId, googleAccountId = "old-sub",
            email = "old@gmail.com", accessToken = enc.encrypt("a"), refreshToken = enc.encrypt("r"),
            tokenExpiresAt = Instant.now(), scopes = listOf("calendar"),
        ).also { it.id = UUID.randomUUID() }
        every { stateStore.consume("state") } returns OAuthStateEntry(credId, "/settings", "verifier", memberId)
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("access", "refresh", 3600, "calendar")
        every { flow.fetchUserInfo("access") } returns GoogleUserInfo("new-sub", "new@gmail.com", "Anna", null)
        every { connections.findByGoogleAccountId("new-sub") } returns null
        every { connections.findByFamilyMemberId(memberId) } returns prior
        every { members.findById(memberId) } returns Optional.of(existingMember)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        service.handleCallback("code", "state")

        verify { connections.delete(prior) }
        verify { connections.save(match<GoogleConnection> { it.googleAccountId == "new-sub" }) }
    }

    @Test
    fun `handleCallback rehangs a known Google account to the chosen member`() {
        val oldMemberId = UUID.randomUUID()
        val newMemberId = UUID.randomUUID()
        val newMember = FamilyMember(name = "Ben", role = "child", color = "pink").also { it.id = newMemberId }
        val existingConn = GoogleConnection(
            familyMemberId = oldMemberId, credentialsId = credId, googleAccountId = "sub-9",
            email = "x@gmail.com", accessToken = enc.encrypt("a"), refreshToken = enc.encrypt("r"),
            tokenExpiresAt = Instant.now(), scopes = listOf("calendar"),
        ).also { it.id = UUID.randomUUID() }
        every { stateStore.consume("state") } returns OAuthStateEntry(credId, "/settings", "verifier", newMemberId)
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("access", "refresh", 3600, "calendar")
        every { flow.fetchUserInfo("access") } returns GoogleUserInfo("sub-9", "x@gmail.com", "X", null)
        every { connections.findByGoogleAccountId("sub-9") } returns existingConn
        every { connections.findByFamilyMemberId(newMemberId) } returns null
        every { members.findById(newMemberId) } returns Optional.of(newMember)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        val result = service.handleCallback("code", "state")

        assertThat(result.memberId).isEqualTo(newMemberId)
        verify { connections.save(match<GoogleConnection> { it.familyMemberId == newMemberId } ) }
    }

    // ─── sanitizeReturnUrl (covered via startAuthorization indirectly, and here directly via handleCallback) ──

    @Test
    fun `sanitizeReturnUrl returns slash for empty url`() {
        // use handleCallback to exercise sanitizeReturnUrl via the state.returnUrl stored;
        // but since state.returnUrl is consumed directly from OAuthStateEntry (the store),
        // we test sanitizeReturnUrl through startAuthorization→stateStore.create param.
        every { credentials.primaryOrNull() } returns credEntity
        every { pkce.generateVerifier() } returns "v"
        every { pkce.challengeFor("v") } returns "c"
        // empty url should sanitize to "/"
        val storeSlot = slot<String>()
        every { stateStore.create(any(), capture(storeSlot), any(), any()) } returns "nonce"
        every { flow.buildAuthorizationUrl(any(), any(), any(), any()) } returns "url"

        service.startAuthorization(null, "")
        assertThat(storeSlot.captured).isEqualTo("/")
    }

    @Test
    fun `sanitizeReturnUrl returns slash for url not starting with slash`() {
        every { credentials.primaryOrNull() } returns credEntity
        every { pkce.generateVerifier() } returns "v"
        every { pkce.challengeFor("v") } returns "c"
        val storeSlot = slot<String>()
        every { stateStore.create(any(), capture(storeSlot), any(), any()) } returns "nonce"
        every { flow.buildAuthorizationUrl(any(), any(), any(), any()) } returns "url"

        service.startAuthorization(null, "noSlash")
        assertThat(storeSlot.captured).isEqualTo("/")
    }

    @Test
    fun `sanitizeReturnUrl returns slash for double-slash url`() {
        every { credentials.primaryOrNull() } returns credEntity
        every { pkce.generateVerifier() } returns "v"
        every { pkce.challengeFor("v") } returns "c"
        val storeSlot = slot<String>()
        every { stateStore.create(any(), capture(storeSlot), any(), any()) } returns "nonce"
        every { flow.buildAuthorizationUrl(any(), any(), any(), any()) } returns "url"

        service.startAuthorization(null, "//evil.com")
        assertThat(storeSlot.captured).isEqualTo("/")
    }

    @Test
    fun `sanitizeReturnUrl returns slash for url containing scheme`() {
        every { credentials.primaryOrNull() } returns credEntity
        every { pkce.generateVerifier() } returns "v"
        every { pkce.challengeFor("v") } returns "c"
        val storeSlot = slot<String>()
        every { stateStore.create(any(), capture(storeSlot), any(), any()) } returns "nonce"
        every { flow.buildAuthorizationUrl(any(), any(), any(), any()) } returns "url"

        service.startAuthorization(null, "/foo://bar")
        assertThat(storeSlot.captured).isEqualTo("/")
    }

    @Test
    fun `sanitizeReturnUrl passes through valid path`() {
        every { credentials.primaryOrNull() } returns credEntity
        every { pkce.generateVerifier() } returns "v"
        every { pkce.challengeFor("v") } returns "c"
        val storeSlot = slot<String>()
        every { stateStore.create(any(), capture(storeSlot), any(), any()) } returns "nonce"
        every { flow.buildAuthorizationUrl(any(), any(), any(), any()) } returns "url"

        service.startAuthorization(null, "/setup")
        assertThat(storeSlot.captured).isEqualTo("/setup")
    }

    // ─── handleCallback ───────────────────────────────────────────────────────

    @Test
    fun `handleCallback rejects unknown state`() {
        every { stateStore.consume("bad") } returns null
        assertThatThrownBy { service.handleCallback("code", "bad") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `handleCallback resolves credentials from entry credentialsId`() {
        every { stateStore.consume("s") } returns OAuthStateEntry(credId, "/setup", "verifier")
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("AT", "RT", 3600, "https://www.googleapis.com/auth/calendar")
        every { flow.fetchUserInfo("AT") } returns GoogleUserInfo("g-123", "papa@ex.de", "Papa", null)
        every { connections.findByGoogleAccountId("g-123") } returns null
        every { members.save(any()) } answers { (firstArg() as FamilyMember).also { it.id = UUID.randomUUID() } }
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }
        every { members.count() } returns 1

        val result = service.handleCallback("code", "s")

        assertThat(result.isNewMember).isTrue()
        verify { credentials.entity(credId) }
        verify(exactly = 0) { credentials.primaryOrNull() }
    }

    @Test
    fun `handleCallback falls back to primaryOrNull when entry has no credentialsId`() {
        every { stateStore.consume("s") } returns OAuthStateEntry(null, "/setup", "verifier")
        every { credentials.primaryOrNull() } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("AT", "RT", 3600, null)
        every { flow.fetchUserInfo("AT") } returns GoogleUserInfo("g-999", "x@y.de", "X", null)
        every { connections.findByGoogleAccountId("g-999") } returns null
        every { members.save(any()) } answers { (firstArg() as FamilyMember).also { it.id = UUID.randomUUID() } }
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }
        every { members.count() } returns 0

        val result = service.handleCallback("code", "s")

        assertThat(result.isNewMember).isTrue()
        verify { credentials.primaryOrNull() }
    }

    @Test
    fun `handleCallback throws ValidationException when no credentials available`() {
        every { stateStore.consume("s") } returns OAuthStateEntry(null, "/setup", "verifier")
        every { credentials.primaryOrNull() } returns null

        assertThatThrownBy { service.handleCallback("code", "s") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `handleCallback creates member and stores tokens for new account`() {
        every { stateStore.consume("s") } returns OAuthStateEntry(credId, "/setup", "verifier")
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("AT", "RT", 3600, "https://www.googleapis.com/auth/calendar")
        every { flow.fetchUserInfo("AT") } returns GoogleUserInfo("g-123", "papa@ex.de", "Papa", null)
        every { connections.findByGoogleAccountId("g-123") } returns null
        every { members.save(any()) } answers { (firstArg() as FamilyMember).also { it.id = UUID.randomUUID() } }
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }
        every { members.count() } returns 1

        val result = service.handleCallback("code", "s")

        assertThat(result.isNewMember).isTrue()
        assertThat(result.memberName).isEqualTo("Papa")
        verify { connections.save(match { enc.decrypt(it.refreshToken) == "RT" && it.status == "active" }) }
        verify { settings.setGoogleConnected(true) }
    }

    @Test
    fun `handleCallback uses email as name when userInfo name is null`() {
        every { stateStore.consume("s") } returns OAuthStateEntry(credId, "/setup", "verifier")
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("AT", "RT", 3600, null)
        every { flow.fetchUserInfo("AT") } returns GoogleUserInfo("g-999", "anon@ex.de", null, null)
        every { connections.findByGoogleAccountId("g-999") } returns null
        every { members.save(any()) } answers { (firstArg() as FamilyMember).also { it.id = UUID.randomUUID() } }
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }
        every { members.count() } returns 2

        val result = service.handleCallback("code", "s")

        assertThat(result.memberName).isEqualTo("anon@ex.de")
        // scopes null branch: should default to emptyList
        verify { connections.save(match { it.scopes.isEmpty() }) }
    }

    @Test
    fun `handleCallback new account with scopes from token`() {
        every { stateStore.consume("s") } returns OAuthStateEntry(credId, "/setup", "verifier")
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("AT", "RT", 3600, "scope1 scope2")
        every { flow.fetchUserInfo("AT") } returns GoogleUserInfo("g-456", "b@c.de", "B", null)
        every { connections.findByGoogleAccountId("g-456") } returns null
        every { members.save(any()) } answers { (firstArg() as FamilyMember).also { it.id = UUID.randomUUID() } }
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }
        every { members.count() } returns 0

        service.handleCallback("code", "s")

        verify { connections.save(match { it.scopes == listOf("scope1", "scope2") }) }
    }

    @Test
    fun `handleCallback fails without refresh token for new account`() {
        every { stateStore.consume("s") } returns OAuthStateEntry(credId, "/", "v")
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns GoogleTokenSet("AT", null, 3600, null)
        every { flow.fetchUserInfo("AT") } returns GoogleUserInfo("g-1", "a@b.de", "A", null)
        every { connections.findByGoogleAccountId(any()) } returns null
        assertThatThrownBy { service.handleCallback("code", "s") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `handleCallback re-auth updates existing connection without new refresh token`() {
        val memberId = UUID.randomUUID()
        val connId = UUID.randomUUID()
        val existingConn =
            GoogleConnection(
                familyMemberId = memberId, credentialsId = credId,
                googleAccountId = "g-existing", email = "old@x.de",
                accessToken = enc.encrypt("oldAT"), refreshToken = enc.encrypt("oldRT"),
                tokenExpiresAt = Instant.now(), scopes = listOf("scope1"), status = "active",
            ).also { it.id = connId }
        val existingMember =
            FamilyMember(name = "Existing User", role = "parent", color = "blue")
                .also { it.id = memberId }

        every { stateStore.consume("s") } returns OAuthStateEntry(credId, "/home", "verifier")
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("newAT", null, 7200, null) // no refresh token in re-auth
        every { flow.fetchUserInfo("newAT") } returns GoogleUserInfo("g-existing", "old@x.de", "Existing User", null)
        every { connections.findByGoogleAccountId("g-existing") } returns existingConn
        every { members.findById(memberId) } returns Optional.of(existingMember)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        val result = service.handleCallback("code", "s")

        assertThat(result.isNewMember).isFalse()
        assertThat(result.memberName).isEqualTo("Existing User")
        // refresh token stays "oldRT" (no new one) AND existing scopes are preserved
        // (null-scope re-auth must not wipe the stored scopes)
        verify { connections.save(match { enc.decrypt(it.refreshToken) == "oldRT" && it.scopes == listOf("scope1") }) }
        verify { settings.setGoogleConnected(true) }
    }

    @Test
    fun `handleCallback re-auth updates refresh token when new one is provided`() {
        val memberId = UUID.randomUUID()
        val connId = UUID.randomUUID()
        val existingConn =
            GoogleConnection(
                familyMemberId = memberId, credentialsId = credId,
                googleAccountId = "g-existing", email = "old@x.de",
                accessToken = enc.encrypt("oldAT"), refreshToken = enc.encrypt("oldRT"),
                tokenExpiresAt = Instant.now(), scopes = listOf("scope1"), status = "active",
            ).also { it.id = connId }
        val existingMember =
            FamilyMember(name = "Existing User", role = "parent", color = "blue")
                .also { it.id = memberId }

        every { stateStore.consume("s") } returns OAuthStateEntry(credId, "/home", "verifier")
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("newAT", "newRT", 7200, "scope1 scope2")
        every { flow.fetchUserInfo("newAT") } returns GoogleUserInfo("g-existing", "old@x.de", "Existing User", null)
        every { connections.findByGoogleAccountId("g-existing") } returns existingConn
        every { members.findById(memberId) } returns Optional.of(existingMember)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        service.handleCallback("code", "s")

        verify { connections.save(match { enc.decrypt(it.refreshToken) == "newRT" }) }
        verify { connections.save(match { it.scopes == listOf("scope1", "scope2") }) }
    }

    @Test
    fun `handleCallback re-auth updates scopes when provided`() {
        val memberId = UUID.randomUUID()
        val existingConn =
            GoogleConnection(
                familyMemberId = memberId, credentialsId = credId,
                googleAccountId = "g-ex2", email = "x@y.de",
                accessToken = enc.encrypt("AT"), refreshToken = enc.encrypt("RT"),
                tokenExpiresAt = Instant.now(), scopes = listOf("old-scope"), status = "active",
            ).also { it.id = UUID.randomUUID() }
        val existingMember =
            FamilyMember(name = "User", role = "parent", color = "blue")
                .also { it.id = memberId }

        every { stateStore.consume("s") } returns OAuthStateEntry(credId, "/", "v")
        every { credentials.entity(credId) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("newAT", null, 3600, "new-scope1 new-scope2")
        every { flow.fetchUserInfo("newAT") } returns GoogleUserInfo("g-ex2", "x@y.de", "User", null)
        every { connections.findByGoogleAccountId("g-ex2") } returns existingConn
        every { members.findById(memberId) } returns Optional.of(existingMember)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        service.handleCallback("code", "s")

        // scopes should be updated to new-scope1 new-scope2
        verify { connections.save(match { it.scopes == listOf("new-scope1", "new-scope2") }) }
    }

    // ─── listConnections ──────────────────────────────────────────────────────

    @Test
    fun `listConnections returns name from member when found`() {
        val memberId = UUID.randomUUID()
        val connId = UUID.randomUUID()
        val conn =
            GoogleConnection(
                familyMemberId = memberId, credentialsId = credId,
                googleAccountId = "g-1", email = "test@x.de",
                accessToken = null, refreshToken = enc.encrypt("RT"),
                tokenExpiresAt = null, scopes = listOf("s1"), status = "active",
            ).also { it.id = connId }
        val member =
            FamilyMember(name = "Member Name", role = "parent", color = "blue")
                .also { it.id = memberId }

        every { connections.findAll() } returns listOf(conn)
        every { members.findById(memberId) } returns Optional.of(member)

        val result = service.listConnections()

        assertThat(result).hasSize(1)
        assertThat(result[0].name).isEqualTo("Member Name")
        assertThat(result[0].email).isEqualTo("test@x.de")
        assertThat(result[0].connectionId).isEqualTo(connId)
    }

    @Test
    fun `listConnections falls back to email when member not found`() {
        val memberId = UUID.randomUUID()
        val connId = UUID.randomUUID()
        val conn =
            GoogleConnection(
                familyMemberId = memberId, credentialsId = null,
                googleAccountId = "g-orphan", email = "orphan@x.de",
                accessToken = null, refreshToken = enc.encrypt("RT"),
                tokenExpiresAt = null, scopes = emptyList(), status = "inactive",
            ).also { it.id = connId }

        every { connections.findAll() } returns listOf(conn)
        every { members.findById(memberId) } returns Optional.empty()

        val result = service.listConnections()

        assertThat(result).hasSize(1)
        assertThat(result[0].name).isEqualTo("orphan@x.de")
    }

    // ─── disconnect ───────────────────────────────────────────────────────────

    @Test
    fun `disconnect revokes token and deletes connection`() {
        val connId = UUID.randomUUID()
        val conn =
            GoogleConnection(
                familyMemberId = UUID.randomUUID(), credentialsId = credId,
                googleAccountId = "g-1", email = "bye@x.de",
                accessToken = null, refreshToken = enc.encrypt("RT-to-revoke"),
                tokenExpiresAt = null, scopes = emptyList(), status = "active",
            ).also { it.id = connId }

        every { connections.findById(connId) } returns Optional.of(conn)
        every { flow.revoke(any()) } just Runs
        every { connections.count() } returns 1L // still 1 after delete (before actual delete)

        service.disconnect(connId)

        verify { flow.revoke("RT-to-revoke") }
        verify { connections.delete(conn) }
        verify(exactly = 0) { settings.setGoogleConnected(false) }
    }

    @Test
    fun `disconnect sets google connected false when last connection removed`() {
        val connId = UUID.randomUUID()
        val conn =
            GoogleConnection(
                familyMemberId = UUID.randomUUID(), credentialsId = credId,
                googleAccountId = "g-last", email = "last@x.de",
                accessToken = null, refreshToken = enc.encrypt("RT-last"),
                tokenExpiresAt = null, scopes = emptyList(), status = "active",
            ).also { it.id = connId }

        every { connections.findById(connId) } returns Optional.of(conn)
        every { flow.revoke(any()) } just Runs
        every { connections.count() } returns 0L // 0 after delete

        service.disconnect(connId)

        verify { connections.delete(conn) }
        verify { settings.setGoogleConnected(false) }
    }

    @Test
    fun `disconnect throws ResourceNotFoundException when connection not found`() {
        val unknownId = UUID.randomUUID()
        every { connections.findById(unknownId) } returns Optional.empty()

        assertThatThrownBy { service.disconnect(unknownId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    @Test
    fun `disconnect continues even if revoke throws`() {
        val connId = UUID.randomUUID()
        val conn =
            GoogleConnection(
                familyMemberId = UUID.randomUUID(), credentialsId = credId,
                googleAccountId = "g-fail", email = "fail@x.de",
                accessToken = null, refreshToken = enc.encrypt("bad-RT"),
                tokenExpiresAt = null, scopes = emptyList(), status = "active",
            ).also { it.id = connId }

        every { connections.findById(connId) } returns Optional.of(conn)
        every { flow.revoke(any()) } throws RuntimeException("revoke network error")
        every { connections.count() } returns 0L

        // Should not throw — runCatching absorbs the revoke error
        assertThatCode { service.disconnect(connId) }.doesNotThrowAnyException()
        verify { connections.delete(conn) }
    }
}
